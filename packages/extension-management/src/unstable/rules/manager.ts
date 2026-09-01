/**
 * Rule manager service.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/Context";
import {
  assertInstructionTargetsSafe,
  assertInstructionsGitignoreSafe,
  observeInstructionProjection,
  reconcileInstructionTargets,
  resolveInstructionsConfig,
  type ResolvedInstructionsConfig,
} from "../workspace-configuration/instructions.js";
import { RuleDefinitionInvalid, RuleInstallStateMissing } from "./errors.js";
import { decodeExtensionNameSync, formatFqn } from "@agentxm/extension-model/unstable/extensions";
import {
  enabledConfiguredEntries,
  materializeExternalPackageWithTreeIntegrity,
  canReuseInstalledPackage,
  materializeRegistryPackageWithTreeIntegrity,
} from "../extensions/index.js";
import { computeExtensionPathsForLayout } from "../workspace/extension-paths.js";
import { activeContributors } from "../projection/contributors.js";
import type { ProjectionUnitObservation } from "../projection/invariant-facts.js";
import {
  applyProjectionPlans,
  planAggregateProjection,
  type ProjectionPlan,
  type ProjectionRenderInput,
} from "../projection/planning.js";
import { parseFrontmatterEffect } from "@agentxm/registry-protocol/unstable/content/frontmatter";
import { computePackageContentHash } from "../workspace/package-hash.js";
import {
  computeMaterializedTreeIntegrity,
  type TreeIntegrity,
} from "../workspace/materialized-tree.js";
import { type SourceHash } from "../workspace/rendered-files.js";
import type { RuleLockEntry } from "../lockfile/index.js";
import { acceptedRegistryVersionForRef, validateExactResolvedVersion } from "../lockfile/index.js";
import { MaterializedFileTargetSchema } from "../workspace/materialized-file-target.js";
import { gitSourceLockFields } from "../lockfile/entry-fields.js";
import { reconcileManagedRegionFile } from "../projection/adapters.js";
import {
  MARKER_KIND_POINT,
  MARKER_VERSION,
  parseMarker,
  serializeMarker,
} from "../projection/marker-grammar.js";
import { SourceHostProviders, WorkspaceCatalog } from "../source-resolution/index.js";
import { stripFileProtocol } from "../utils/index.js";
import { makeWorkspaceRelativeSourcePath } from "@agentxm/extension-model/unstable/path-types";
import { removeIfExists } from "../workspace/remove-if-exists.js";
import { makeWorkspaceRelativePath } from "@agentxm/extension-model/unstable/path-types";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import type {
  ExtensionManager,
  MaterializationObservation,
} from "../extension-workspace/extension-manager.js";
import type { ExtensionManagerFailure } from "../extension-workspace/errors.js";
import type { ExtensionTarget } from "../workspace/service-interface.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import {
  makeConfiguredReleaseAgeEvaluation,
  resolveConfiguredRule,
} from "../extension-lifecycle/configured-entry-resolution.js";
import { isObservedInstalled } from "../workspace/observed-installed.js";
import {
  acceptedCanonicalObservation,
  prepareAcceptedCanonicalTransition,
  removableAcceptedCanonicalPath,
} from "../workspace/accepted-canonical-ref.js";
import {
  RULE_BODY_FILENAME,
  RULE_EXTENSION_DIR,
  RULE_MANIFEST_FILENAME,
  RuleManifestSchema,
  type RuleManifest,
} from "@agentxm/extension-model/unstable/rules/manifest-schema";
import {
  type GitHostedRuleRef,
  type LocalRuleRef,
  type RegistryRuleRef,
  type RuleExtensionRef,
} from "../workspace/refs/rule.js";

export interface RuleManagerService extends ExtensionManager<RuleExtensionRef> {
  readonly projectionPlans: () => Effect.Effect<
    ReadonlyArray<ProjectionPlan>,
    ExtensionManagerFailure
  >;
}

export class RuleManager extends ServiceMap.Service<RuleManager, RuleManagerService>()(
  "@agentxm/extension-management/unstable/rules/manager/RuleManager",
) {}

const RULES_REGION = "rules";
export const RULES_REGION_OWNER = "@agentxm/rules/instructions";

const decodeRuleManifest = Schema.decodeUnknownEffect(RuleManifestSchema);
const decodeMaterializedTarget = Schema.decodeUnknownSync(MaterializedFileTargetSchema);

const registryRuleLockEntry = (
  ref: RegistryRuleRef,
  treeIntegrity: TreeIntegrity,
): RuleLockEntry => ({
  type: "registry",
  sourceType: "registry",
  packageFormat: "agentxm",
  endpoint: ref.source.location,
  extensionType: "rule",
  workspaceName: ref.rule.name,
  owner: ref.owner,
  name: ref.name,
  resolvedVersion: decodeVersionSync(ref.version),
  integrity: Option.getOrElse(ref.integrity, () => ""),
  sourceName: ref.source.name,
  publisherBindingId: ref.publisherBindingId,
  treeIntegrity,
});

const gitRuleLockEntry = (
  ref: GitHostedRuleRef,
  contentIdentity: SourceHash,
  treeIntegrity: TreeIntegrity,
): RuleLockEntry => ({
  ...gitSourceLockFields(
    ref.source,
    "rule",
    ref.rule.name,
    Option.fromUndefinedOr(ref.sourcePath),
    ref.gitCommitSha,
    ref.gitTreeSha,
    contentIdentity,
    ref.owner,
    ref.name,
    treeIntegrity,
  ),
});

const localRuleLockEntry = (
  ref: LocalRuleRef,
  workspaceRelativeLocalSourcePath: Option.Option<string>,
  contentIdentity: SourceHash,
  treeIntegrity: TreeIntegrity,
): RuleLockEntry => ({
  type: "local",
  sourceType: "local",
  sourceName: "local",
  extensionType: "rule",
  workspaceName: ref.rule.name,
  packageFormat: "agentxm",
  packageOwner: ref.owner,
  packageName: ref.name,
  path: Option.getOrElse(workspaceRelativeLocalSourcePath, () => ref.source.path),
  contentIdentity,
  treeIntegrity,
});

const normalizeMarkdown = (content: string): string =>
  content
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

export const ruleMaterializationObservation = (
  managedTarget: string,
  instructionItems: ReadonlyArray<{
    readonly agentId: string;
    readonly health: string;
  }>,
): MaterializationObservation => {
  const agents = Array.from(
    new Set(
      instructionItems
        .filter(({ agentId, health }) => health === "ok" && agentId !== "universal")
        .map(({ agentId }) => agentId),
    ),
  );
  return {
    agents,
    targets: [
      {
        path: managedTarget,
        ...(agents.length === 0 ? {} : { agentIds: agents }),
      },
    ],
  };
};

export const RuleManagerLive = Layer.effect(
  RuleManager,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const httpClient = yield* HttpClient.HttpClient;
    const path = yield* Path.Path;
    const sources = yield* SourceHostProviders;
    const catalog = yield* WorkspaceCatalog;
    const baseDir = ws.baseDir;
    const workspaceScope = ws.scope;

    const fsPathLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(HttpClient.HttpClient, httpClient),
      Layer.succeed(Path.Path, path),
    );
    const envLayer = Layer.mergeAll(
      fsPathLayer,
      Layer.succeed(WorkspaceMutations, ws),
      Layer.succeed(SourceHostProviders, sources),
      Layer.succeed(WorkspaceCatalog, catalog),
    );
    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, envLayer);

    const lastInstallState = new Map<
      string,
      {
        readonly ref: RuleExtensionRef;
        readonly workspaceRelativeLocalSourcePath: Option.Option<string>;
        readonly sourceHash: SourceHash;
        readonly treeIntegrity: TreeIntegrity;
      }
    >();
    let lastProjection: MaterializationObservation | undefined;

    const materializeFromRegistry = (ref: RegistryRuleRef, force: boolean) =>
      Effect.gen(function* () {
        const canonicalPath = computeExtensionPathsForLayout(
          path.join,
          ws.layout,
          ref,
          RULE_EXTENSION_DIR,
          ref.name,
        ).canonicalPath;
        const lockedEntry = yield* ws.getLockedRuleEntry(ref.rule.name);
        const lockedVersion = acceptedRegistryVersionForRef(lockedEntry, ref);
        const reuse = yield* provide(
          canReuseInstalledPackage({
            installedPath: canonicalPath,
            force,
            refVersion: ref.version,
            hasIntegrity: Option.isSome(ref.integrity),
            ...(lockedVersion === undefined ? {} : { lockedVersion }),
            existsFailureDetail: (target) =>
              `Failed to check if canonical rule package path exists: ${target}`,
          }),
        );
        if (reuse && Option.isSome(lockedEntry)) {
          const observedTree = yield* provide(computeMaterializedTreeIntegrity(canonicalPath));
          if (observedTree === lockedEntry.value.treeIntegrity) {
            return { packageRoot: canonicalPath, treeIntegrity: lockedEntry.value.treeIntegrity };
          }
        }
        const materialized = yield* provide(
          materializeRegistryPackageWithTreeIntegrity({
            baseDir,
            destinationPath: canonicalPath,
            sourceLocation: ref.source.location,
            owner: ref.owner,
            type: "rule",
            name: ref.name,
            version: ref.version,
            integrity: ref.integrity,
            messages: {
              integrityMismatchDetail: `Integrity mismatch for rule:${ref.name}@${ref.version}`,
            },
          }),
        );
        return {
          packageRoot: materialized.canonicalPath,
          treeIntegrity: materialized.treeIntegrity,
        };
      });

    const materializeFromExternal = (ref: GitHostedRuleRef | LocalRuleRef) =>
      provide(
        materializeExternalPackageWithTreeIntegrity({
          baseDir,
          canonicalPath: computeExtensionPathsForLayout(
            path.join,
            ws.layout,
            ref,
            RULE_EXTENSION_DIR,
            ref.rule.name,
          ).canonicalPath,
          sourceLocation: ref.location,
          copyFailureCode: "validation",
          copyFailureDetail: (canonicalPath) =>
            `Failed to copy rule package files to ${canonicalPath}`,
        }).pipe(
          Effect.map((materialized) => ({
            packageRoot: materialized.canonicalPath,
            treeIntegrity: materialized.treeIntegrity,
          })),
        ),
      );

    const materializePackage = (ref: RuleExtensionRef, force = false) =>
      Effect.gen(function* () {
        switch (ref.refType) {
          case "registry":
            return yield* materializeFromRegistry(ref, force);
          case "git-hosted":
          case "local":
            return yield* materializeFromExternal(ref);
          case "workspace": {
            const expectedPath = computeExtensionPathsForLayout(
              path.join,
              ws.layout,
              ref,
              RULE_EXTENSION_DIR,
              ref.name,
            ).canonicalPath;
            if (
              ref.scope !== ws.scope ||
              path.resolve(ref.location) !== path.resolve(expectedPath)
            ) {
              return yield* new RuleDefinitionInvalid({
                detail: `Invalid workspace rule source location: ${ref.location}`,
              });
            }
            return {
              packageRoot: ref.location,
              treeIntegrity: yield* provide(computeMaterializedTreeIntegrity(ref.location)),
            };
          }
        }
      });

    const readManifest = (packageRoot: string) =>
      fs.readFileString(path.join(packageRoot, RULE_MANIFEST_FILENAME)).pipe(
        Effect.flatMap((content) =>
          Effect.try({
            try: (): unknown => JSON.parse(content),
            catch: (error) =>
              new RuleDefinitionInvalid({
                detail: `Failed to parse ${RULE_MANIFEST_FILENAME}`,
                cause: error,
              }),
          }),
        ),
        Effect.flatMap((content) => decodeRuleManifest(content)),
        Effect.mapError(
          (error) =>
            new RuleDefinitionInvalid({
              detail: `Failed to read ${RULE_MANIFEST_FILENAME}`,
              cause: error,
            }),
        ),
      );

    const sourceFileTarget = () =>
      Effect.gen(function* () {
        const config = yield* ws.getInstructionsConfig();
        const resolved = resolveInstructionsConfig(
          Option.isSome(config) && config.value !== false ? config.value : undefined,
        );
        const relative = makeWorkspaceRelativePath(path, baseDir, resolved.fileName);
        if (Option.isNone(relative)) {
          return yield* new RuleDefinitionInvalid({
            detail: `Rule instruction source escapes workspace: ${resolved.fileName}`,
          });
        }
        return {
          relative: relative.value,
          absolute: path.resolve(baseDir, relative.value),
        };
      });

    const activeInstructions = () =>
      Effect.gen(function* () {
        const config = yield* ws.getInstructionsConfig();
        if (Option.isNone(config) || config.value === false) {
          return Option.none<{
            readonly config: ResolvedInstructionsConfig;
            readonly agents: ReadonlyArray<string>;
          }>();
        }
        return Option.some({
          config: resolveInstructionsConfig(config.value),
          agents: yield* ws.getConfiguredAgents(),
        });
      });

    const readRuleBody = (packageRoot: string) =>
      fs.readFileString(path.join(packageRoot, "src", RULE_BODY_FILENAME)).pipe(
        Effect.flatMap((content) => parseFrontmatterEffect(content)),
        Effect.map((parsed) => normalizeMarkdown(parsed.body)),
        Effect.mapError(
          (error) =>
            new RuleDefinitionInvalid({
              detail: `Failed to read src/${RULE_BODY_FILENAME}`,
              cause: error,
            }),
        ),
      );

    const renderRuleBlock = (args: {
      readonly marker: string;
      readonly manifest: RuleManifest;
      readonly body: string;
    }): string => {
      const header =
        args.manifest.title !== undefined && !args.body.startsWith("#")
          ? `# ${args.manifest.title}\n\n`
          : "";
      const marker = serializeMarker(
        {
          kind: MARKER_KIND_POINT,
          v: MARKER_VERSION,
          pointKind: "rule",
          ext: `${args.marker}@${args.manifest.version}`,
        },
        { kind: "block", open: "<!--", close: "-->" },
      );
      return `${marker}\n\n${header}${args.body}`;
    };

    interface RenderedRuleContributor {
      readonly name: string;
      readonly marker: string;
      readonly manifest: RuleManifest;
      readonly body: string;
    }

    const selectRuleContributors = (args: {
      readonly graph: Parameters<typeof activeContributors>[0]["graph"];
      readonly locked: Parameters<typeof activeContributors>[0]["locked"];
    }) =>
      provide(
        activeContributors({
          layout: ws.layout,
          path,
          type: "rule",
          extensionDir: RULE_EXTENSION_DIR,
          graph: args.graph,
          locked: args.locked,
        }),
      ).pipe(
        Effect.flatMap((contributors) =>
          Effect.forEach(
            contributors,
            (contributor) =>
              Effect.gen(function* () {
                const manifest = yield* readManifest(contributor.packageRoot);
                const body = yield* readRuleBody(contributor.packageRoot);
                const marker = Option.match(contributor.identityOwner, {
                  onSome: (owner) =>
                    formatFqn({
                      owner,
                      type: "rule",
                      name: decodeExtensionNameSync(contributor.node.name),
                    }),
                  onNone: () =>
                    formatFqn({ owner: manifest.owner, type: "rule", name: manifest.name }),
                });
                return { name: contributor.node.name, marker, manifest, body };
              }),
            { concurrency: "unbounded" },
          ),
        ),
        Effect.map((resolved) => {
          const sorted = [...resolved].sort((a, b) => {
            const byPriority = (a.manifest.priority ?? 100) - (b.manifest.priority ?? 100);
            if (byPriority !== 0) return byPriority;
            return a.marker.localeCompare(b.marker);
          });
          return sorted;
        }),
      );

    const observedRuleContributors = (content: string): ReadonlyArray<string> =>
      content.split(/\r?\n/u).flatMap((line) => {
        const parsed = parseMarker(line, { kind: "block", open: "<!--", close: "-->" });
        if (
          parsed.state !== "complete" ||
          parsed.marker.kind !== MARKER_KIND_POINT ||
          parsed.marker.pointKind !== "rule"
        ) {
          return [];
        }
        const separator = parsed.marker.ext.lastIndexOf("@");
        return separator > 0 ? [parsed.marker.ext.slice(0, separator)] : [];
      });

    const reconcileRulesRegion = (args: {
      readonly input: ProjectionRenderInput<RenderedRuleContributor>;
      readonly target: { readonly relative: string; readonly absolute: string };
      readonly instructions: Option.Option<{
        readonly config: ResolvedInstructionsConfig;
        readonly agents: ReadonlyArray<string>;
      }>;
      readonly dryRun?: boolean;
    }) =>
      Effect.gen(function* () {
        const { target } = args;
        const contributors = args.input.contributors;
        const rendered = contributors.map(renderRuleBlock).join("\n\n");
        const instructions = args.instructions;
        if (args.dryRun !== true && Option.isSome(instructions)) {
          yield* provide(
            Effect.gen(function* () {
              const snapshot = yield* observeInstructionProjection({
                workspaceRoot: baseDir,
                scope: workspaceScope,
                configuredAgents: instructions.value.agents,
                config: instructions.value.config,
              });
              yield* assertInstructionTargetsSafe(snapshot.status);
              yield* assertInstructionsGitignoreSafe(baseDir);
            }),
          );
        }
        const reconciliation = yield* provide(
          reconcileManagedRegionFile({
            targetPath: target.absolute,
            displayPath: target.relative,
            region: RULES_REGION,
            owner: RULES_REGION_OWNER,
            rendered,
            ...(args.dryRun === undefined ? {} : { dryRun: args.dryRun }),
            writeWhenMissing: true,
            unsupportedTargetDetail: `Instruction source does not support managed regions: ${target.relative}`,
          }),
        );
        const { changed, observedRegion } = reconciliation;
        const materializedTarget = decodeMaterializedTarget({
          target: target.relative,
          mode: "managed-region",
          region: RULES_REGION,
        });
        const projectionUnitObservation = {
          unitId: "rule:instructions-region",
          path: `${target.relative}#${RULES_REGION}`,
          owner: RULES_REGION_OWNER,
          present: Option.isSome(observedRegion),
          current: !changed,
          expectedContributors: contributors.map(({ marker }) => marker),
          observedContributors: Option.match(observedRegion, {
            onNone: () => [],
            onSome: observedRuleContributors,
          }),
        } satisfies ProjectionUnitObservation;
        if (args.dryRun === true) {
          return {
            materializedTarget,
            materialization: ruleMaterializationObservation(target.relative, []),
            changed,
            projectionUnitObservation,
          };
        }

        const instructionItems = Option.isSome(instructions)
          ? (yield* provide(
              reconcileInstructionTargets({
                workspaceRoot: baseDir,
                scope: workspaceScope,
                configuredAgents: instructions.value.agents,
                config: instructions.value.config,
              }),
            )).snapshot.status.items
          : [];

        const materialization = ruleMaterializationObservation(target.relative, instructionItems);
        lastProjection = materialization;
        return { materializedTarget, materialization, changed, projectionUnitObservation };
      });

    const makeRulesProjectionPlan = () =>
      Effect.gen(function* () {
        const target = yield* sourceFileTarget();
        const instructions = yield* activeInstructions();
        const graph = yield* ws.getDesiredStateGraph();
        const locked = yield* ws.getLockedRules();
        return yield* planAggregateProjection({
          unitId: "rule:instructions-region",
          targetFile: target.absolute,
          graph,
          select: (completeGraph) => selectRuleContributors({ graph: completeGraph, locked }),
          adapter: {
            observe: (input) =>
              reconcileRulesRegion({ input, target, instructions, dryRun: true }).pipe(
                Effect.map(({ projectionUnitObservation }) => projectionUnitObservation),
              ),
            apply: (input) =>
              reconcileRulesRegion({ input, target, instructions }).pipe(Effect.asVoid),
          },
        });
      });

    const projectionPlans = () => makeRulesProjectionPlan().pipe(Effect.map((plan) => [plan]));

    const applyRulesProjection = projectionPlans().pipe(Effect.flatMap(applyProjectionPlans));

    const materializeInstall: ExtensionManager<RuleExtensionRef>["materializeInstall"] = Effect.fn(
      "RuleManager.materializeInstall",
    )(function* ({ ref, force }) {
      const materialized = yield* materializePackage(ref, force === true);
      const packageRoot = materialized.packageRoot;
      yield* readManifest(packageRoot);

      const workspaceRelativeLocalSourcePath =
        ref.refType === "local"
          ? makeWorkspaceRelativeSourcePath(
              path,
              baseDir,
              ref.sourcePath ?? stripFileProtocol(ref.location),
            )
          : Option.none<string>();
      if (ref.refType === "local" && Option.isNone(workspaceRelativeLocalSourcePath)) {
        return yield* new RuleDefinitionInvalid({
          detail: `Local rule source path must stay within the workspace root: ${ref.source.path}`,
        });
      }

      const sourceHash = yield* provide(computePackageContentHash(packageRoot));
      lastInstallState.set(ref.rule.name, {
        ref,
        workspaceRelativeLocalSourcePath,
        sourceHash,
        treeIntegrity: materialized.treeIntegrity,
      });
    }, Effect.asVoid);

    const buildLockEntry = (
      ref: RuleExtensionRef,
    ): Effect.Effect<Option.Option<RuleLockEntry>, RuleInstallStateMissing> =>
      Effect.gen(function* () {
        const state = lastInstallState.get(ref.rule.name);
        switch (ref.refType) {
          case "registry":
            return state === undefined
              ? yield* new RuleInstallStateMissing({ name: ref.rule.name, kind: "tree-integrity" })
              : Option.some(registryRuleLockEntry(ref, state.treeIntegrity));
          case "git-hosted":
            return state === undefined
              ? yield* new RuleInstallStateMissing({
                  name: ref.rule.name,
                  kind: "content-identity",
                })
              : Option.some(gitRuleLockEntry(ref, state.sourceHash, state.treeIntegrity));
          case "local":
            return state === undefined
              ? yield* new RuleInstallStateMissing({
                  name: ref.rule.name,
                  kind: "content-identity",
                })
              : Option.some(
                  localRuleLockEntry(
                    ref,
                    state.workspaceRelativeLocalSourcePath,
                    state.sourceHash,
                    state.treeIntegrity,
                  ),
                );
          case "workspace":
            return Option.none();
        }
      });

    // Canonical removal only. The shared operation flow re-renders the region
    // after settings and lock removal, once the target has left the graph.
    const materializeUninstall: ExtensionManager<RuleExtensionRef>["materializeUninstall"] =
      Effect.fn("RuleManager.materializeUninstall")(function* ({ target }) {
        const canonical = yield* provide(
          acceptedCanonicalObservation({
            workspace: ws,
            type: "rule",
            name: target.name,
          }),
        );
        const packageRoot = removableAcceptedCanonicalPath(canonical);
        if (Option.isSome(packageRoot)) {
          yield* removeIfExists(fs, packageRoot.value);
        }
      }, Effect.asVoid);
    // Deactivation retains canonical content; the caller updates settings
    // first, so re-rendering the whole region drops this rule's contribution.
    const materializeDeactivate: ExtensionManager<RuleExtensionRef>["materializeDeactivate"] =
      Effect.fn("RuleManager.materializeDeactivate")(() => applyRulesProjection);

    return {
      type: "rule",
      projectionPlans,
      runTransaction: ws.runTransaction,
      isInstalled: ({ target }: { readonly target: ExtensionTarget }) =>
        isObservedInstalled(ws, "rule", target.name).pipe(
          Effect.withSpan("RuleManager.isInstalled"),
        ),

      materializeInstall,
      prepareSourceTransition: ({ ref }) =>
        provide(
          prepareAcceptedCanonicalTransition({
            workspace: ws,
            type: "rule",
            name: ref.rule.name,
            ref,
          }),
        ),
      getLastMaterialization: () => Effect.succeed(lastProjection ?? { agents: [], targets: [] }),
      getConfiguredSource: Effect.fn("RuleManager.getConfiguredSource")(function* ({ target }) {
        const configured = yield* ws.getConfiguredRuleEntries();
        return Option.fromUndefinedOr(configured[target.name]?.source);
      }),

      listMaterializable: Effect.fn("RuleManager.listMaterializable")(function* () {
        const configured = yield* ws.getConfiguredRuleEntries();
        const releaseAgeEvaluation = yield* provide(makeConfiguredReleaseAgeEvaluation("enforce"));
        const refs = yield* Effect.scoped(
          Effect.forEach(
            enabledConfiguredEntries(configured),
            ([name, entry]) =>
              provide(resolveConfiguredRule(name, entry.source, releaseAgeEvaluation)).pipe(
                Effect.map(({ ref }) => ref),
              ),
            { concurrency: "unbounded" },
          ),
        );
        return refs;
      }),

      materializeUninstall,
      materializeDeactivate,

      upsertSettingsEntry: Effect.fn("RuleManager.upsertSettingsEntry")(function* ({
        ref,
        versionRange,
      }) {
        const lockEntry = yield* buildLockEntry(ref);
        if (Option.isNone(lockEntry)) {
          yield* ws.setRuleEntry(ref.rule.name, {
            source: "workspace",
            enabled: true,
          });
          return;
        }
        if (lockEntry.value.type === "registry") {
          yield* validateExactResolvedVersion(
            `rules.${ref.rule.name}.resolvedVersion`,
            lockEntry.value.resolvedVersion,
          );
        }
        yield* ws.setRule({
          name: ref.rule.name,
          lockEntry: lockEntry.value,
          versionRange,
        });
      }),

      removeSettingsEntry: Effect.fn("RuleManager.removeSettingsEntry")(function* ({ target }) {
        yield* ws.removeRuleSettings(target.name);
      }),

      upsertLockfileEntry: Effect.fn("RuleManager.upsertLockfileEntry")(function* ({ ref }) {
        const lockEntry = yield* buildLockEntry(ref);
        if (Option.isNone(lockEntry)) {
          yield* ws.removeRuleLock(ref.rule.name);
          return;
        }
        if (lockEntry.value.type === "registry") {
          yield* validateExactResolvedVersion(
            `rules.${ref.rule.name}.resolvedVersion`,
            lockEntry.value.resolvedVersion,
          );
        }
        yield* ws.setRuleLock({
          name: ref.rule.name,
          lockEntry: lockEntry.value,
          versionRange: Option.none(),
        });
      }),

      removeLockfileEntry: Effect.fn("RuleManager.removeLockfileEntry")(function* ({ target }) {
        yield* ws.removeRuleLock(target.name);
      }),
    };
  }),
);
