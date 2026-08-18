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
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/Context";
import {
  assertInstructionTargetsSafe,
  assertInstructionsGitignoreSafe,
  reconcileInstructionTargets,
  resolveInstructionsConfig,
  type ResolvedInstructionsConfig,
} from "../agents/instructions.js";
import { makeAppError, type AppError } from "../app-error/index.js";
import {
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
  decodeExtensionNameSync,
  enabledConfiguredEntries,
  formatFqn,
  materializeExternalPackage,
  canReuseInstalledPackage,
  materializeRegistryPackage,
} from "../extensions/index.js";
import { activeContributors } from "../projection/index.js";
import {
  frontmatterParseFailureToAppError,
  parseFrontmatterEffect,
} from "../extensions/frontmatter.js";
import { computePackageContentHash } from "../extensions/package-hash.js";
import { type SourceHash } from "../extensions/rendered-files.js";
import type { RuleLockEntry } from "../lockfile/index.js";
import { acceptedRegistryVersionForRef, validateExactResolvedVersion } from "../lockfile/index.js";
import {
  MaterializedFileTargetSchema,
  type MaterializedFileTarget,
} from "../workspace/materialized-file-target.js";
import { gitSourceLockFields } from "../lockfile/entry-fields.js";
import {
  commentStyleForTarget,
  replaceManagedRegion,
  stripManagedRegion,
} from "../managed-files/index.js";
import { SourceHostProviders } from "../source-resolution/index.js";
import { makeWorkspaceRelativeSourcePath } from "../utils/index.js";
import { printSourceParams } from "../sources/index.js";
import { makeWorkspaceRelativePath } from "../utils/path-types.js";
import { decodeVersionSync } from "../version-constraints/version-constraints.js";
import type {
  ExtensionManager,
  ExtensionTarget,
  MaterializationObservation,
} from "../workspace/service-interface.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import {
  makeConfiguredReleaseAgeEvaluation,
  resolveConfiguredRule,
} from "../workspace/configured-entry-resolution/index.js";
import { isObservedInstalled } from "../workspace/observed-installed.js";
import { acceptedCanonicalObservation } from "../workspace/accepted-canonical-ref.js";
import { protectWorkspacePath } from "../workspace/transaction.js";
import {
  RULE_BODY_FILENAME,
  RULE_EXTENSION_DIR,
  RULE_MANIFEST_FILENAME,
  RuleManifestSchema,
  type GitHostedRuleRef,
  type LocalRuleRef,
  type RegistryRuleRef,
  type RuleExtensionRef,
  type RuleManifest,
} from "./index.js";

export interface RuleManagerService extends ExtensionManager<RuleExtensionRef> {
  readonly reconcileInstructions: Effect.Effect<MaterializedFileTarget, AppError>;
  /** True when the managed Rules region already renders its complete contributor set. */
  readonly instructionsRegionCurrent: Effect.Effect<boolean, AppError>;
  readonly reconcileProjections: () => Effect.Effect<void, AppError>;
}

export class RuleManager extends ServiceMap.Service<RuleManager, RuleManagerService>()(
  "@agentxm/client-core/unstable/rules/manager/RuleManager",
) {}

const RULES_REGION = "rules";

const decodeRuleManifest = Schema.decodeUnknownEffect(RuleManifestSchema);
const decodeMaterializedTarget = Schema.decodeUnknownSync(MaterializedFileTargetSchema);

const registryRuleLockEntry = (ref: RegistryRuleRef): RuleLockEntry => ({
  type: "registry",
  owner: ref.owner,
  name: ref.name,
  resolvedVersion: decodeVersionSync(ref.version),
  integrity: Option.getOrElse(ref.integrity, () => ""),
  sourceName: "default",
  publisherBindingId: ref.publisherBindingId,
});

const gitRuleLockEntry = (ref: GitHostedRuleRef, contentIdentity: SourceHash): RuleLockEntry => ({
  ...gitSourceLockFields(ref.source, ref.gitCommitSha, ref.gitTreeSha, contentIdentity),
});

const localRuleLockEntry = (
  ref: LocalRuleRef,
  workspaceRelativeLocalSourcePath: Option.Option<string>,
  contentIdentity: SourceHash,
): RuleLockEntry => ({
  type: "local",
  path: Option.getOrElse(workspaceRelativeLocalSourcePath, () => ref.source.path),
  contentIdentity,
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
    const baseDir = ws.baseDir;

    const fsPathLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(HttpClient.HttpClient, httpClient),
      Layer.succeed(Path.Path, path),
    );
    const envLayer = Layer.mergeAll(
      fsPathLayer,
      Layer.succeed(WorkspaceMutations, ws),
      Layer.succeed(SourceHostProviders, sources),
    );
    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, envLayer);

    const lastInstallState = new Map<
      string,
      {
        readonly ref: RuleExtensionRef;
        readonly workspaceRelativeLocalSourcePath: Option.Option<string>;
        readonly sourceHash: SourceHash;
      }
    >();
    let lastProjection: MaterializationObservation | undefined;

    const materializeFromRegistry = (ref: RegistryRuleRef, force: boolean) =>
      Effect.gen(function* () {
        const canonicalPath = path.join(
          baseDir,
          REGISTRY_EXTENSIONS_DIR,
          ref.owner,
          RULE_EXTENSION_DIR,
          ref.name,
        );
        const lockedVersion = acceptedRegistryVersionForRef(
          yield* ws.getLockedRuleEntry(ref.rule.name),
          ref,
        );
        const reuse = yield* provide(
          canReuseInstalledPackage({
            installedPath: canonicalPath,
            force,
            integrity: ref.integrity,
            version: ref.version,
            ...(lockedVersion === undefined ? {} : { lockedVersion }),
            existsFailureDetail: (target) =>
              `Failed to check if canonical rule package path exists: ${target}`,
          }),
        );
        if (reuse) return canonicalPath;
        return yield* provide(
          materializeRegistryPackage({
            baseDir,
            destinationPath: canonicalPath,
            sourceLocation: ref.source.location,
            owner: ref.owner,
            type: "rule",
            name: ref.name,
            version: ref.version,
            integrity: ref.integrity,
            messages: {
              integrityMismatchCode: "network",
              integrityMismatchDetail: `Integrity mismatch for rule:${ref.name}@${ref.version}`,
              tempDirectoryFailureDetail:
                "Temporary directory for registry rule install could not be created",
              createDirectoryFailureDetail: (canonicalPath) =>
                `Failed to create registry rule directory: ${canonicalPath}`,
              inspectExtractedFailureDetail: "Failed to inspect extracted registry rule package",
              copyEntryFailureCode: "internal",
              copyEntryFailureDetail: (entry) =>
                `Failed to copy registry rule package entry: ${entry}`,
            },
          }),
        );
      });

    const materializeFromExternal = (ref: GitHostedRuleRef | LocalRuleRef) =>
      provide(
        materializeExternalPackage({
          baseDir,
          canonicalPath: path.join(
            baseDir,
            EXTERNAL_EXTENSIONS_DIR,
            RULE_EXTENSION_DIR,
            ref.rule.name,
          ),
          sourceLocation: ref.location,
          copyFailureCode: "validation",
          copyFailureDetail: (canonicalPath) =>
            `Failed to copy rule package files to ${canonicalPath}`,
        }),
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
            const expectedPath = path.join(
              baseDir,
              REGISTRY_EXTENSIONS_DIR,
              ref.owner,
              RULE_EXTENSION_DIR,
              ref.name,
            );
            if (
              ref.scope !== ws.scope ||
              path.resolve(ref.location) !== path.resolve(expectedPath)
            ) {
              return yield* makeAppError({
                code: "validation",
                detail: `Invalid workspace rule source location: ${ref.location}`,
              });
            }
            return ref.location;
          }
        }
      });

    const readManifest = (packageRoot: string) =>
      fs.readFileString(path.join(packageRoot, RULE_MANIFEST_FILENAME)).pipe(
        Effect.flatMap((content) =>
          Effect.try({
            try: (): unknown => JSON.parse(content),
            catch: (error) =>
              makeAppError({
                code: "validation",
                detail: `Failed to parse ${RULE_MANIFEST_FILENAME}`,
                cause: error,
              }),
          }),
        ),
        Effect.flatMap((content) => decodeRuleManifest(content)),
        Effect.mapError((error) =>
          makeAppError({
            code: "validation",
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
          return yield* makeAppError({
            code: "validation",
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
        Effect.flatMap((content) =>
          parseFrontmatterEffect(content).pipe(Effect.mapError(frontmatterParseFailureToAppError)),
        ),
        Effect.map((parsed) => normalizeMarkdown(parsed.body)),
        Effect.mapError((error) =>
          makeAppError({
            code: "validation",
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
      // The blank line after the marker keeps the rendered region stable under
      // Prettier, which separates block HTML comments from following content.
      return `<!-- axm:rule ${args.marker}@${args.manifest.version} -->\n\n${header}${args.body}`;
    };

    // The Rules region is an aggregate ownership unit: its contributor set is
    // every enabled Rule the complete desired-state graph reaches, whether
    // declared directly or contributed by a Pack. Membership never comes from
    // settings entries, and content is read from accepted canonical packages.
    //
    // With `onUnready: "skip"` a contributor whose accepted resolution or
    // canonical content is not yet readable yields Option.none: a lifecycle
    // step installing several contributors defers the region write until the
    // closure's final reconcile can render the complete set. An incomplete
    // desired-state graph always fails; skipping never drops a contributor
    // from a rendered set.
    const renderInstalledRulesRegion = (args?: { readonly onUnready?: "fail" | "skip" }) =>
      Effect.gen(function* () {
        const resolved = yield* Effect.result(
          Effect.gen(function* () {
            const graph = yield* ws.getDesiredStateGraph();
            const locked = yield* ws.getLockedRules();
            const contributors = yield* activeContributors({
              baseDir,
              path,
              type: "rule",
              extensionDir: RULE_EXTENSION_DIR,
              graph,
              locked,
            });
            return yield* Effect.forEach(
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
            );
          }),
        );
        if (Result.isFailure(resolved)) {
          if (args?.onUnready === "skip") return Option.none<string>();
          return yield* resolved.failure;
        }

        const sorted = [...resolved.success].sort((a, b) => {
          const byPriority = (a.manifest.priority ?? 100) - (b.manifest.priority ?? 100);
          if (byPriority !== 0) return byPriority;
          return a.marker.localeCompare(b.marker);
        });

        return Option.some(sorted.map(renderRuleBlock).join("\n\n"));
      });

    const writeRulesRegion = (args?: {
      readonly dryRun?: boolean;
      readonly onUnready?: "fail" | "skip";
    }) =>
      Effect.gen(function* () {
        const target = yield* sourceFileTarget();
        const style = commentStyleForTarget(target.relative);
        if (Option.isNone(style)) {
          return yield* makeAppError({
            code: "validation",
            detail: `Instruction source does not support managed regions: ${target.relative}`,
          });
        }

        const renderedOption = yield* renderInstalledRulesRegion(args);
        if (Option.isNone(renderedOption)) {
          // A contributor is not renderable yet; a later step in the same
          // closure completes the write, and lint and sync detect the region
          // if convergence never happens.
          return {
            materializedTarget: decodeMaterializedTarget({
              target: target.relative,
              mode: "managed-region",
              region: RULES_REGION,
            }),
            materialization: ruleMaterializationObservation(target.relative, []),
            changed: false,
          };
        }
        const rendered = renderedOption.value;
        // Only treat an absent file as empty; a real read failure on an existing
        // file must propagate, or we would overwrite unreadable user content
        // with just the managed region.
        const fileExists = yield* fs.exists(target.absolute).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "internal",
              detail: `Failed to inspect managed instructions file: ${target.absolute}`,
              cause: error,
            }),
          ),
        );
        const existing = fileExists
          ? yield* fs.readFileString(target.absolute).pipe(
              Effect.mapError((error) =>
                makeAppError({
                  code: "internal",
                  detail: `Failed to read managed instructions file: ${target.absolute}`,
                  cause: error,
                }),
              ),
            )
          : "";
        const updated =
          rendered.length === 0
            ? stripManagedRegion(existing, { region: RULES_REGION }, style.value)
            : replaceManagedRegion({
                content: existing,
                marker: { region: RULES_REGION },
                rendered,
                style: style.value,
              });
        const changed = updated !== existing;
        const materializedTarget = decodeMaterializedTarget({
          target: target.relative,
          mode: "managed-region",
          region: RULES_REGION,
        });
        if (args?.dryRun === true) {
          return {
            materializedTarget,
            materialization: ruleMaterializationObservation(target.relative, []),
            changed,
          };
        }

        const instructions = yield* activeInstructions();
        if (Option.isSome(instructions)) {
          yield* provide(
            Effect.all(
              [
                assertInstructionTargetsSafe({
                  workspaceRoot: baseDir,
                  scope: ws.scope,
                  configuredAgents: instructions.value.agents,
                  config: instructions.value.config,
                }),
                assertInstructionsGitignoreSafe(baseDir),
              ],
              { concurrency: 1, discard: true },
            ),
          );
        }
        if (changed || !fileExists) {
          yield* protectWorkspacePath(target.absolute);
          yield* fs.makeDirectory(path.dirname(target.absolute), { recursive: true }).pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: "internal",
                detail: `Failed to create rules managed region target directory: ${path.dirname(target.absolute)}`,
                cause: error,
              }),
            ),
          );
          yield* fs.writeFileString(target.absolute, updated).pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: "internal",
                detail: `Failed to write rules managed region target: ${target.absolute}`,
                cause: error,
              }),
            ),
          );
        }

        const instructionItems = Option.isSome(instructions)
          ? (yield* provide(
              reconcileInstructionTargets({
                workspaceRoot: baseDir,
                scope: ws.scope,
                configuredAgents: instructions.value.agents,
                config: instructions.value.config,
              }),
            )).status.items
          : [];

        const materialization = ruleMaterializationObservation(target.relative, instructionItems);
        lastProjection = materialization;
        return { materializedTarget, materialization, changed };
      });

    const materializeInstall: ExtensionManager<RuleExtensionRef>["materializeInstall"] = Effect.fn(
      "RuleManager.materializeInstall",
    )(function* ({ ref, force }) {
      const packageRoot = yield* materializePackage(ref, force === true);
      yield* readManifest(packageRoot);

      const workspaceRelativeLocalSourcePath =
        ref.refType === "local"
          ? makeWorkspaceRelativeSourcePath(path, baseDir, ref.source.path)
          : Option.none<string>();
      if (ref.refType === "local" && Option.isNone(workspaceRelativeLocalSourcePath)) {
        return yield* makeAppError({
          code: "validation",
          detail: `Local rule source path must stay within the workspace root: ${ref.source.path}`,
        });
      }

      const sourceHash = yield* provide(computePackageContentHash(packageRoot));
      lastInstallState.set(ref.rule.name, {
        ref,
        workspaceRelativeLocalSourcePath,
        sourceHash,
      });
    }, Effect.asVoid);

    const buildLockEntry = (
      ref: RuleExtensionRef,
    ): Effect.Effect<Option.Option<RuleLockEntry>, AppError> =>
      Effect.gen(function* () {
        const state = lastInstallState.get(ref.rule.name);
        switch (ref.refType) {
          case "registry":
            return Option.some(registryRuleLockEntry(ref));
          case "git-hosted":
            return state === undefined
              ? yield* makeAppError({
                  code: "internal",
                  detail: `Rule ${ref.rule.name} has no materialized content identity`,
                })
              : Option.some(gitRuleLockEntry(ref, state.sourceHash));
          case "local":
            return state === undefined
              ? yield* makeAppError({
                  code: "internal",
                  detail: `Rule ${ref.rule.name} has no materialized content identity`,
                })
              : Option.some(
                  localRuleLockEntry(ref, state.workspaceRelativeLocalSourcePath, state.sourceHash),
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
        const packageRoot = Option.flatMap(canonical, (state) =>
          Option.fromUndefinedOr(state.observation.path),
        );
        if (Option.isSome(packageRoot)) {
          yield* protectWorkspacePath(packageRoot.value);
          yield* fs.remove(packageRoot.value, { recursive: true, force: true }).pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: "internal",
                detail: `Failed to remove rule package source: ${packageRoot.value}`,
                cause: error,
              }),
            ),
          );
        }
      }, Effect.asVoid);
    // Deactivation retains canonical content; the caller updates settings
    // first, so re-rendering the whole region drops this rule's contribution.
    const materializeDeactivate: ExtensionManager<RuleExtensionRef>["materializeDeactivate"] =
      Effect.fn("RuleManager.materializeDeactivate")(
        () => writeRulesRegion({ onUnready: "skip" }),
        Effect.asVoid,
      );

    return {
      type: "rule",
      reconcileInstructions: writeRulesRegion().pipe(
        Effect.map(({ materializedTarget }) => materializedTarget),
      ),
      reconcileProjections: () => writeRulesRegion({ onUnready: "skip" }).pipe(Effect.asVoid),
      instructionsRegionCurrent: writeRulesRegion({ dryRun: true }).pipe(
        Effect.map(({ changed }) => !changed),
      ),
      runTransaction: ws.runTransaction,
      isInstalled: ({ target }: { readonly target: ExtensionTarget }) =>
        isObservedInstalled(ws, "rule", target.name).pipe(
          Effect.withSpan("RuleManager.isInstalled"),
        ),

      materializeInstall,
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
            source: printSourceParams(ref.source),
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
