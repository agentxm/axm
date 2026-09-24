import { LifecyclePostconditionViolated } from "../transitions/planning/index.js";
import type { RuleManagerService } from "../materialization/managers.js";
import { usableAcceptedCanonical } from "../desired-state/index.js";

/**
 * Rule manager service.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import {
  DesiredStateReader,
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceRecords,
} from "../desired-state/index.js";

import { stripFileProtocol } from "@agentxm/registry-client";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { RuleDefinitionInvalid, RuleInstallStateMissing } from "./errors.js";
import {
  activeContributors,
  applyProjectionPlans,
  planAggregateProjection,
  type ProjectionRenderInput,
  reconcileManagedRegionFile,
  projectionGeneration,
  assertInstructionTargetsSafe,
  assertInstructionsGitignoreSafe,
  observeInstructionProjection,
  reconcileInstructionTargets,
  resolveInstructionsConfig,
} from "../projection/index.js";
import {
  MARKER_KIND_POINT,
  MARKER_VERSION,
  serializeMarker,
} from "../projection/agent-adapters/index.js";
import { decodeExtensionNameSync, formatFqn } from "@agentxm/extension-model/unstable/extensions";
import {
  reusableCanonicalTree,
  materializeExternalPackageWithTreeIntegrity,
} from "../acquisition/canonical-directory.js";
import { enabledConfiguredEntries } from "../desired-state/index.js";
import { materializeRegistryPackageWithTreeIntegrity } from "../materialization/registry-materialization.js";
import { acquiredDirectoryForRef } from "../acquisition/acquired-content.js";
import { computeExtensionPathsForLayout } from "../desired-state/index.js";
import type { ProjectionUnitObservation, ResolvedInstructionsConfig } from "../projection/index.js";
import { RuleManager } from "../materialization/managers.js";
import { RULES_REGION_OWNER } from "../projection/index.js";
import { parseFrontmatterEffect } from "@agentxm/extension-content";
import { computePackageContentHash } from "../desired-state/index.js";
import { computeMaterializedTreeIntegrity, type TreeIntegrity } from "../desired-state/index.js";
import { type SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import type { RuleLockEntry } from "../desired-state/index.js";
import { validateExactResolvedVersion } from "../desired-state/index.js";
import { MaterializedFileTargetSchema } from "../desired-state/index.js";
import {
  gitSourceLockFields,
  pathSourceLockFields,
  registrySourceLockFields,
} from "../desired-state/index.js";
import { SourceHostProviders, WorkspaceCatalog } from "../resolution/sources/index.js";
import { makeWorkspaceRelativeSourcePath } from "@agentxm/extension-model/unstable/path-types";
import { removeIfExists } from "../desired-state/index.js";
import { makeWorkspaceRelativePath } from "@agentxm/extension-model/unstable/path-types";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import type { MaterializationObservation } from "../materialization/manager-contract.js";
import { NO_MATERIALIZATION_OBSERVATION } from "../materialization/manager-contract.js";
import type { RuleMaterializationFacts } from "../materialization/managers.js";
import type { ExtensionTarget } from "../desired-state/index.js";
import { usableAcceptedCanonicalRef } from "../desired-state/index.js";
import { isObservedInstalled } from "../desired-state/index.js";
import {
  acceptedCanonicalObservation,
  prepareAcceptedCanonicalTransition,
  removableAcceptedCanonicalPath,
} from "../desired-state/index.js";
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
} from "@agentxm/extension-model/unstable/extensions/refs/rule";

const RULES_REGION = "rules";

const decodeRuleManifest = Schema.decodeUnknownEffect(RuleManifestSchema);
const decodeMaterializedTarget = Schema.decodeUnknownSync(MaterializedFileTargetSchema);

const registryRuleLockEntry = (ref: RegistryRuleRef, treeIntegrity: TreeIntegrity): RuleLockEntry =>
  registrySourceLockFields(
    ref.source,
    ref.owner,
    ref.name,
    decodeVersionSync(ref.version),
    Option.getOrElse(ref.integrity, () => ""),
    ref.publisherBindingId,
    treeIntegrity,
  );

const gitRuleLockEntry = (
  ref: GitHostedRuleRef,
  contentIdentity: SourceHash,
  treeIntegrity: TreeIntegrity,
): RuleLockEntry => ({
  ...gitSourceLockFields(
    ref.source,
    Option.fromUndefinedOr(ref.sourcePath),
    ref.gitCommitSha,
    ref.gitTreeSha,
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
): RuleLockEntry =>
  pathSourceLockFields(
    Option.getOrElse(workspaceRelativeLocalSourcePath, () => ref.source.path),
    contentIdentity,
    ref.name,
    treeIntegrity,
    ref.owner,
  );

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
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const lockfile = yield* LockfileReader;
    const desiredState = yield* DesiredStateReader;
    const records = yield* WorkspaceRecords;
    const currentLayout = () => Ref.getUnsafe(location.layout);
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sources = yield* SourceHostProviders;
    const catalog = yield* WorkspaceCatalog;
    const baseDir = location.baseDir;
    const workspaceScope = location.scope;

    // The workspace state ports and source integration are this layer's own
    // dependencies; the platform stays in `R` for every member.
    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Effect.provideService(WorkspaceLocation, location),
        Effect.provideService(SettingsReader, settings),
        Effect.provideService(LockfileReader, lockfile),
        Effect.provideService(DesiredStateReader, desiredState),
        Effect.provideService(WorkspaceRecords, records),
        Effect.provideService(SourceHostProviders, sources),
        Effect.provideService(WorkspaceCatalog, catalog),
      );

    // The instructions region is an aggregate unit: it renders after desired
    // state commits, so the closure reads back what the render projected.
    const lastProjection = yield* Ref.make(NO_MATERIALIZATION_OBSERVATION);

    const materializeFromRegistry = (ref: RegistryRuleRef, force: boolean) =>
      Effect.gen(function* () {
        const canonicalPath = computeExtensionPathsForLayout(
          path.join,
          currentLayout(),
          ref,
          RULE_EXTENSION_DIR,
          ref.name,
        ).canonicalPath;
        const reusable = yield* provide(
          reusableCanonicalTree({
            canonicalPath,
            requested: {
              refType: "registry",
              owner: ref.owner,
              name: ref.name,
              version: ref.version,
              publisherBindingId: ref.publisherBindingId,
            },
            accepted: yield* lockfile.entry("rule", ref.rule.name),
            force: force,
          }),
        );
        if (Option.isSome(reusable)) {
          return { packageRoot: canonicalPath, treeIntegrity: reusable.value };
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
            publisherBindingId: ref.publisherBindingId,
            ...(ref.lifecycleWarnings === undefined
              ? {}
              : { lifecycleWarnings: ref.lifecycleWarnings }),
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
      Effect.flatMap(acquiredDirectoryForRef(ref, ref.location), (sourceLocation) =>
        provide(
          materializeExternalPackageWithTreeIntegrity({
            baseDir,
            canonicalPath: computeExtensionPathsForLayout(
              path.join,
              currentLayout(),
              ref,
              RULE_EXTENSION_DIR,
              ref.rule.name,
            ).canonicalPath,
            sourceLocation,
            copyFailureCode: "validation",
            copyFailureDetail: (canonicalPath) =>
              `Failed to copy rule package files to ${canonicalPath}`,
          }).pipe(
            Effect.map((materialized) => ({
              packageRoot: materialized.canonicalPath,
              treeIntegrity: materialized.treeIntegrity,
            })),
          ),
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
              currentLayout(),
              ref,
              RULE_EXTENSION_DIR,
              ref.name,
            ).canonicalPath;
            if (
              ref.scope !== location.scope ||
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
        const config = yield* settings.instructionsConfig;
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
        const config = yield* settings.instructionsConfig;
        if (Option.isNone(config) || config.value === false) {
          return Option.none<{
            readonly config: ResolvedInstructionsConfig;
            readonly agents: ReadonlyArray<string>;
          }>();
        }
        return Option.some({
          config: resolveInstructionsConfig(config.value),
          agents: yield* settings.configuredAgents,
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
      readonly locked: Parameters<typeof activeContributors>[0]["accepted"];
    }) =>
      provide(
        activeContributors({
          layout: currentLayout(),
          type: "rule",
          graph: args.graph,
          accepted: args.locked,
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
            { concurrency: 16 },
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
        const generation = projectionGeneration([
          "rule-instructions-region-v1",
          target.relative,
          RULES_REGION_OWNER,
          ...contributors.flatMap((contributor) => [
            contributor.name,
            contributor.marker,
            contributor.body,
            JSON.stringify(contributor.manifest),
          ]),
        ]);
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
            generation,
            ...(args.dryRun === undefined ? {} : { dryRun: args.dryRun }),
            writeWhenMissing: true,
            unsupportedTargetDetail: `AXM cannot add its instruction section because ${target.relative} does not support comments`,
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
        yield* Ref.set(lastProjection, materialization);
        return { materializedTarget, materialization, changed, projectionUnitObservation };
      });

    const makeRulesProjectionPlan = () =>
      Effect.gen(function* () {
        const target = yield* sourceFileTarget();
        const instructions = yield* activeInstructions();
        const graph = yield* desiredState.graph();
        const locked = yield* lockfile.entries("rule");
        return yield* planAggregateProjection({
          unitId: "rule:instructions-region",
          targetFile: target.absolute,
          graph,
          // Rule contributors are decided from desired state alone, so the
          // instructions region never excludes one.
          select: (completeGraph) =>
            selectRuleContributors({ graph: completeGraph, locked }).pipe(
              Effect.map((contributors) => ({ contributors, exclusions: [] })),
            ),
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

    const materializeInstall: RuleManagerService["materializeInstall"] = Effect.fn(
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

      const sourceHash = yield* computePackageContentHash(packageRoot);
      return {
        observation: NO_MATERIALIZATION_OBSERVATION,
        treeIntegrity: Option.some(materialized.treeIntegrity),
        acquired: Option.some({
          ref,
          workspaceRelativeLocalSourcePath,
          sourceHash,
          treeIntegrity: materialized.treeIntegrity,
        }),
      } satisfies RuleMaterializationFacts;
    });

    const buildLockEntry = (
      ref: RuleExtensionRef,
      materialization: Option.Option<RuleMaterializationFacts>,
    ): Effect.Effect<Option.Option<RuleLockEntry>, RuleInstallStateMissing> =>
      Effect.gen(function* () {
        const state = Option.getOrUndefined(
          materialization.pipe(Option.flatMap((facts) => facts.acquired)),
        );
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
    const withdrawn: RuleMaterializationFacts = {
      observation: NO_MATERIALIZATION_OBSERVATION,
      treeIntegrity: Option.none(),
      acquired: Option.none(),
    };
    const materializeUninstall: RuleManagerService["materializeUninstall"] = Effect.fn(
      "RuleManager.materializeUninstall",
    )(function* ({ target }) {
      const canonical = yield* provide(
        acceptedCanonicalObservation({
          type: "rule",
          name: target.name,
        }),
      );
      const packageRoot = removableAcceptedCanonicalPath(canonical);
      if (Option.isSome(packageRoot)) {
        yield* removeIfExists(fs, packageRoot.value);
      }
      return withdrawn;
    });
    // Deactivation retains canonical content; the caller updates settings
    // first, so re-rendering the whole region drops this rule's contribution.
    const materializeDeactivate: RuleManagerService["materializeDeactivate"] = Effect.fn(
      "RuleManager.materializeDeactivate",
    )(() => applyRulesProjection.pipe(Effect.as(withdrawn)));

    return {
      projectionPlans,
      aggregateProjectionObservation: Ref.get(lastProjection),
      isInstalled: ({ target }: { readonly target: ExtensionTarget }) =>
        isObservedInstalled(records, "rule", target.name).pipe(
          Effect.withSpan("RuleManager.isInstalled"),
        ),

      materializeInstall,
      acquireCanonical: materializeInstall,
      materializeRetained: ({ target }) =>
        Effect.gen(function* () {
          const canonical = yield* usableAcceptedCanonical({
            type: "rule",
            name: target.name,
          });
          if (Option.isNone(canonical) || canonical.value.ref.type !== "rule") {
            return yield* new LifecyclePostconditionViolated({
              postcondition: "materialize-observable",
              targetType: "rule",
              targetName: target.name,
            });
          }
          return yield* materializeInstall({ ref: canonical.value.ref });
        }),
      prepareSourceTransition: ({ ref }) =>
        provide(
          prepareAcceptedCanonicalTransition({
            type: "rule",
            name: ref.rule.name,
            ref,
          }),
        ),
      getConfiguredSource: Effect.fn("RuleManager.getConfiguredSource")(function* ({ target }) {
        const configured = yield* settings.entries("rule");
        return Option.fromUndefinedOr(configured[target.name]?.source);
      }),

      /**
       * Every enabled entry's accepted canonical package, read from accepted
       * resolution rather than re-resolved from source. Materialization
       * realizes what the workspace already accepted; going back to the
       * source would put an unrelated configured entry's release age between
       * an operator and the extension they are authoring.
       */
      listMaterializable: Effect.fn("RuleManager.listMaterializable")(function* () {
        const configured = yield* settings.entries("rule");
        const refs = yield* Effect.forEach(
          enabledConfiguredEntries(configured),
          ([name]) =>
            provide(
              usableAcceptedCanonicalRef({ type: "rule", name }).pipe(
                Effect.map(Option.filter((ref): ref is RuleExtensionRef => ref.type === "rule")),
              ),
            ),
          { concurrency: 16 },
        );
        return refs.flatMap((ref) => (Option.isSome(ref) ? [ref.value] : []));
      }),

      materializeUninstall,
      materializeDeactivate,

      acceptedResolution: Effect.fn("RuleManager.acceptedResolution")(function* ({
        ref,
        materialization,
      }) {
        const lockEntry = yield* buildLockEntry(ref, materialization);
        if (Option.isNone(lockEntry)) {
          return Option.none();
        }
        if (lockEntry.value.source.type === "registry" && "version" in lockEntry.value.resolved) {
          yield* validateExactResolvedVersion(
            `rules.${ref.rule.name}.resolvedVersion`,
            lockEntry.value.resolved.version,
          );
        }
        return Option.some({ key: ref.rule.name, entry: lockEntry.value });
      }),

      withdrawnResolutionKeys: ({ target }) => Effect.succeed([target.name]),
    } satisfies RuleManagerService;
  }),
);
