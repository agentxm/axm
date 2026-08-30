// @effect-diagnostics anyUnknownInErrorContext:off — schema and filesystem errors are translated to AppError inside this manager
/** Lifecycle manager for isolated Open Knowledge Format bundles. */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as ServiceMap from "effect/Context";
import * as Result from "effect/Result";
import { resolveInstructionsConfig } from "../agents/instructions.js";
import { AppError, makeAppError } from "../app-error/index.js";
import {
  canReuseInstalledPackage,
  materializeExternalPackage,
  materializeRegistryPackage,
} from "../extensions/index.js";
import {
  computeExtensionPathsForLayout,
  extensionPathSourceFromLockEntry,
} from "../extensions/extension-paths.js";
import { computePackageContentHash } from "../extensions/package-hash.js";
import {
  computeMaterializedTreeIntegrity,
  type TreeIntegrity,
} from "../extensions/materialized-tree.js";
import type { SourceHash } from "../extensions/rendered-files.js";
import type { KnowledgeLockEntry } from "../lockfile/index.js";
import { acceptedRegistryVersionForRef, validateExactResolvedVersion } from "../lockfile/index.js";
import { gitSourceLockFields } from "../lockfile/entry-fields.js";
import { SourceHostProviders } from "../source-resolution/index.js";
import type { KnowledgeMap } from "../settings/index.js";
import { knowledgeLockEntryToRef } from "../sources/index.js";
import { makeWorkspaceRelativeSourcePath, stripFileProtocol } from "../utils/index.js";
import { recordFootprint } from "../workspace/footprint-recorder.js";
import { makeWorkspaceRelativePath } from "../utils/path-types.js";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import {
  makeConfiguredReleaseAgeEvaluation,
  resolveConfiguredKnowledge,
} from "../workspace/configured-entry-resolution/index.js";
import { getKnowledgeLockEntries } from "../workspace/locked-entries.js";
import type { ExtensionManager, ExtensionTarget } from "../workspace/service-interface.js";
import { surfaceRestorationIncomplete } from "../workspace/transaction.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import { isObservedInstalled } from "../workspace/observed-installed.js";
import {
  acceptedCanonicalObservation,
  prepareAcceptedCanonicalTransition,
  removableAcceptedCanonicalPath,
} from "../workspace/accepted-canonical-ref.js";
import { protectWorkspacePath } from "../workspace/transaction.js";
import {
  isSourcedDesiredExtension,
  type DesiredStateGraph,
} from "../workspace/desired-state-graph.js";
import type { ResolvedKnowledgeDiscoveryConfig } from "./discovery-config.js";
import {
  applyProjectionPlans,
  planAggregateProjection,
  type ProjectionPlan,
} from "../projection/planning.js";
import { requireCompleteGraph } from "../projection/contributors.js";
import {
  KNOWLEDGE_EXTENSION_DIR,
  KNOWLEDGE_MANIFEST_FILENAME,
  KNOWLEDGE_SOURCE_DIR,
  KnowledgeManifestSchema,
  type KnowledgeManifest,
} from "@agentxm/extension-model/unstable/knowledge/manifest-schema";
import {
  inspectKnowledgeBundle,
  type KnowledgeInspection,
} from "@agentxm/registry-protocol/unstable/knowledge/okf";
import {
  KNOWLEDGE_REGION_OWNER,
  reconcileKnowledgeDiscovery,
  observedKnowledgeContributors,
  type KnowledgeDiscoveryBundle,
} from "./discovery.js";
import { resolveKnowledgeInstructionEntry } from "./instruction-entry.js";
import type {
  GitHostedKnowledgeRef,
  KnowledgeExtensionRef,
  LocalKnowledgeRef,
  RegistryKnowledgeRef,
} from "./refs.js";

export interface KnowledgeManagerService extends ExtensionManager<KnowledgeExtensionRef> {
  readonly projectionPlans: () => Effect.Effect<ReadonlyArray<ProjectionPlan>, AppError>;
  readonly refreshCatalog: () => Effect.Effect<void, ReturnType<typeof makeAppError>>;
  readonly sync: (options: {
    readonly dryRun: boolean;
  }) => Effect.Effect<KnowledgeSyncResult, ReturnType<typeof makeAppError>>;
  readonly install: (args: {
    readonly ref: KnowledgeExtensionRef;
    readonly versionRange: Option.Option<VersionRange>;
    readonly deferProjection?: boolean;
  }) => Effect.Effect<void, ReturnType<typeof makeAppError>>;
}

export interface KnowledgeSyncResult {
  readonly changed: boolean;
  readonly warnings: ReadonlyArray<string>;
  readonly artifacts: ReadonlyArray<{
    readonly path: string;
    readonly change: "created" | "updated" | "removed" | "unchanged";
    readonly mechanism?: "symlink" | "copy";
  }>;
}

interface PreparedKnowledgePackage {
  readonly root: string;
  readonly sourceHash: SourceHash;
  readonly treeIntegrity?: TreeIntegrity;
  readonly commit: Effect.Effect<void, ReturnType<typeof makeAppError>>;
  readonly rollback: Effect.Effect<void, ReturnType<typeof makeAppError>>;
}

export class KnowledgeManager extends ServiceMap.Service<
  KnowledgeManager,
  KnowledgeManagerService
>()("@agentxm/extension-management/unstable/knowledge/manager/KnowledgeManager") {}

const decodeManifest = Schema.decodeUnknownEffect(KnowledgeManifestSchema);
const registryLockEntry = (
  ref: RegistryKnowledgeRef,
  treeIntegrity: TreeIntegrity,
): KnowledgeLockEntry => ({
  type: "registry",
  sourceType: "registry",
  packageFormat: "agentxm",
  endpoint: ref.source.location,
  extensionType: "knowledge",
  workspaceName: ref.knowledge.name,
  owner: ref.owner,
  name: ref.name,
  resolvedVersion: decodeVersionSync(ref.version),
  integrity: Option.getOrElse(ref.integrity, () => ""),
  sourceName: ref.source.name,
  publisherBindingId: ref.publisherBindingId,
  treeIntegrity,
});

const gitLockEntry = (
  ref: GitHostedKnowledgeRef,
  contentIdentity: SourceHash,
  treeIntegrity: TreeIntegrity,
): KnowledgeLockEntry => ({
  ...gitSourceLockFields(
    ref.source,
    "knowledge",
    ref.knowledge.name,
    Option.fromUndefinedOr(ref.sourcePath),
    ref.gitCommitSha,
    ref.gitTreeSha,
    contentIdentity,
    ref.owner,
    ref.name,
    treeIntegrity,
  ),
});

const localLockEntry = (
  ref: LocalKnowledgeRef,
  relativePath: Option.Option<string>,
  contentIdentity: SourceHash,
  treeIntegrity: TreeIntegrity,
): KnowledgeLockEntry => ({
  type: "local",
  sourceType: "local",
  sourceName: "local",
  extensionType: "knowledge",
  workspaceName: ref.knowledge.name,
  packageFormat: "agentxm",
  packageOwner: ref.owner,
  packageName: ref.name,
  path: Option.getOrElse(relativePath, () => ref.source.path),
  contentIdentity,
  treeIntegrity,
});

export const KnowledgeManagerLive = Layer.effect(
  KnowledgeManager,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const httpClient = yield* HttpClient.HttpClient;
    const path = yield* Path.Path;
    const sources = yield* SourceHostProviders;
    const baseDir = ws.baseDir;
    const env = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(HttpClient.HttpClient, httpClient),
      Layer.succeed(Path.Path, path),
      Layer.succeed(WorkspaceMutations, ws),
      Layer.succeed(SourceHostProviders, sources),
    );
    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, env);
    const lastInstallState = new Map<
      string,
      {
        readonly relativeLocalSource: Option.Option<string>;
        readonly sourceHash: SourceHash;
        readonly treeIntegrity?: TreeIntegrity;
      }
    >();

    const canonicalPathForRef = (ref: KnowledgeExtensionRef): string =>
      computeExtensionPathsForLayout(path.join, ws.layout, ref, KNOWLEDGE_EXTENSION_DIR, ref.name)
        .canonicalPath;

    const materializePackage = (
      ref: KnowledgeExtensionRef,
      options?: {
        readonly baseDir?: string;
        readonly destinationPath?: string;
      },
    ) => {
      const canonicalPath = options?.destinationPath ?? canonicalPathForRef(ref);
      const materializationBaseDir = options?.baseDir ?? baseDir;
      switch (ref.refType) {
        case "registry":
          return Effect.gen(function* () {
            return yield* provide(
              materializeRegistryPackage({
                baseDir: materializationBaseDir,
                destinationPath: canonicalPath,
                sourceLocation: ref.source.location,
                owner: ref.owner,
                type: "knowledge",
                name: ref.name,
                version: ref.version,
                integrity: ref.integrity,
                messages: {
                  integrityMismatchDetail: `Integrity mismatch for knowledge:${ref.name}@${ref.version}`,
                },
              }),
            );
          });
        case "git-hosted":
        case "local":
          return provide(
            materializeExternalPackage({
              baseDir: materializationBaseDir,
              canonicalPath,
              sourceLocation: ref.location,
              copyFailureCode: "validation",
              copyFailureDetail: (target) => `Failed to copy knowledge package to ${target}`,
            }),
          );
        case "workspace":
          if (
            ref.scope !== ws.scope ||
            path.resolve(ref.location) !== path.resolve(canonicalPath)
          ) {
            return Effect.fail(
              makeAppError({
                code: "validation",
                detail: `Invalid workspace knowledge source location: ${ref.location}`,
              }),
            );
          }
          return Effect.succeed(ref.location);
      }
    };

    const inspectPackage = (packageRoot: string) =>
      Effect.gen(function* () {
        const raw = yield* fs
          .readFileString(path.join(packageRoot, KNOWLEDGE_MANIFEST_FILENAME))
          .pipe(
            Effect.mapError((cause) =>
              makeAppError({
                code: "validation",
                detail: `Failed to read ${KNOWLEDGE_MANIFEST_FILENAME}`,
                cause,
              }),
            ),
          );
        const manifest = yield* Effect.try({
          try: (): unknown => JSON.parse(raw),
          catch: (cause) =>
            makeAppError({
              code: "validation",
              detail: `Failed to parse ${KNOWLEDGE_MANIFEST_FILENAME}`,
              cause,
            }),
        }).pipe(
          Effect.flatMap(decodeManifest),
          Effect.mapError((cause) =>
            makeAppError({
              code: "validation",
              detail: `Invalid ${KNOWLEDGE_MANIFEST_FILENAME}`,
              cause,
            }),
          ),
        );
        const inspection = yield* provide(
          inspectKnowledgeBundle(path.join(packageRoot, KNOWLEDGE_SOURCE_DIR)),
        ).pipe(
          Effect.mapError((cause) =>
            makeAppError({
              code: "validation",
              detail: "Failed to inspect Open Knowledge Format bundle",
              cause,
            }),
          ),
        );
        const errors = inspection.diagnostics.filter((item) => item.severity === "error");
        if (errors.length > 0) {
          return yield* makeAppError({
            code: "validation",
            detail: errors
              .map((item) =>
                item.details?.kind === "frontmatter-parse"
                  ? `${item.relativePath}: ${item.message}`
                  : item.message,
              )
              .join(" "),
          });
        }
        return { manifest, inspection };
      });

    const preparePackage = (
      ref: KnowledgeExtensionRef,
      force = false,
    ): Effect.Effect<PreparedKnowledgePackage, ReturnType<typeof makeAppError>, Scope.Scope> =>
      Effect.gen(function* () {
        const canonicalPath = canonicalPathForRef(ref);
        if (ref.refType === "workspace") {
          const root = yield* materializePackage(ref);
          yield* inspectPackage(root);
          return {
            root,
            sourceHash: ref.sourceHash,
            commit: Effect.void,
            rollback: Effect.void,
          };
        }
        // Decide against the canonical tree before staging: the staged path
        // never exists, so a decision made there would re-extract every time
        // and revert workspace-owned content on a no-op install.
        if (ref.refType === "registry") {
          const lockedEntry = yield* ws.getLockedKnowledgeEntry(ref.knowledge.name);
          const lockedVersion = acceptedRegistryVersionForRef(lockedEntry, ref);
          const reuse = yield* provide(
            canReuseInstalledPackage({
              installedPath: canonicalPath,
              force,
              refVersion: ref.version,
              hasIntegrity: Option.isSome(ref.integrity),
              ...(lockedVersion === undefined ? {} : { lockedVersion }),
              existsFailureDetail: (target) => `Failed to inspect knowledge path: ${target}`,
            }),
          );
          if (reuse && Option.isSome(lockedEntry)) {
            const observedTree = yield* provide(computeMaterializedTreeIntegrity(canonicalPath));
            if (observedTree !== lockedEntry.value.treeIntegrity) {
              yield* Effect.logWarning(
                `Knowledge package ${ref.knowledge.name} differs from its accepted tree; rematerializing`,
              );
            } else {
              return {
                root: canonicalPath,
                sourceHash: yield* provide(computePackageContentHash(canonicalPath)),
                treeIntegrity: lockedEntry.value.treeIntegrity,
                commit: Effect.void,
                rollback: Effect.void,
              };
            }
          }
        }
        const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "axm-knowledge-package-" });
        const stagedPath = path.join(tempDir, "staged");
        const backupPath = path.join(tempDir, "previous");
        const stageState = yield* Ref.make<
          | { readonly phase: "preparing" }
          | { readonly phase: "staged"; readonly hadCanonical: boolean }
          | { readonly phase: "settled" }
        >({ phase: "preparing" });
        const restoreStagedPackage = Ref.get(stageState).pipe(
          Effect.flatMap((state) => {
            if (state.phase !== "staged") return Effect.void;
            return fs.remove(canonicalPath, { recursive: true, force: true }).pipe(
              Effect.mapError((cause) =>
                makeAppError({
                  code: "internal",
                  detail: `Failed to remove staged Knowledge package during rollback: ${canonicalPath}`,
                  cause,
                }),
              ),
              Effect.andThen(
                state.hadCanonical
                  ? fs.rename(backupPath, canonicalPath).pipe(
                      Effect.mapError((cause) =>
                        makeAppError({
                          code: "internal",
                          detail: `Failed to restore Knowledge package during rollback: ${canonicalPath}`,
                          cause,
                        }),
                      ),
                    )
                  : Effect.void,
              ),
              Effect.andThen(Ref.set(stageState, { phase: "settled" })),
            );
          }),
        );
        yield* Effect.addFinalizer(() =>
          restoreStagedPackage.pipe(
            Effect.catchCause((cause) =>
              Effect.logError(
                "Failed to restore staged Knowledge package during finalization",
                cause,
              ),
            ),
          ),
        );
        const stagedRoot = yield* materializePackage(ref, {
          baseDir: tempDir,
          destinationPath: stagedPath,
        });
        yield* inspectPackage(stagedRoot);
        const sourceHash = yield* provide(computePackageContentHash(stagedRoot));
        const treeIntegrity = yield* provide(computeMaterializedTreeIntegrity(stagedRoot));
        yield* protectWorkspacePath(canonicalPath);
        const hadCanonical = yield* fs.exists(canonicalPath);
        yield* Effect.uninterruptible(
          Effect.gen(function* () {
            if (hadCanonical) yield* fs.rename(canonicalPath, backupPath);
            yield* fs.makeDirectory(path.dirname(canonicalPath), { recursive: true });
            yield* fs.rename(stagedPath, canonicalPath).pipe(
              Effect.tapError(() =>
                hadCanonical
                  ? fs.rename(backupPath, canonicalPath).pipe(
                      Effect.mapError((cause) =>
                        makeAppError({
                          code: "internal",
                          detail: `Failed to restore Knowledge package after staging failed: ${canonicalPath}`,
                          cause,
                        }),
                      ),
                    )
                  : Effect.void,
              ),
            );
            yield* Ref.set(stageState, { phase: "staged", hadCanonical });
          }),
        );
        yield* recordFootprint({
          path: canonicalPath,
          change: hadCanonical ? "modified" : "created",
        });
        return {
          root: canonicalPath,
          sourceHash,
          treeIntegrity,
          commit: Ref.set(stageState, { phase: "settled" }),
          rollback: restoreStagedPackage,
        };
      }).pipe(
        Effect.mapError((cause) =>
          cause instanceof AppError
            ? cause
            : makeAppError({
                code: "internal",
                detail: `Failed to stage Knowledge bundle ${ref.knowledge.name}`,
                cause,
              }),
        ),
      );

    const getInstructionsTarget = () =>
      Effect.gen(function* () {
        const config = yield* ws.getInstructionsConfig();
        const enabled = Option.isSome(config) && config.value !== false;
        const resolved = resolveInstructionsConfig(enabled ? config.value : undefined);
        const relative = makeWorkspaceRelativePath(path, baseDir, resolved.fileName);
        if (Option.isNone(relative)) {
          return yield* makeAppError({
            code: "validation",
            detail: `Knowledge discovery instruction target escapes workspace: ${resolved.fileName}`,
          });
        }
        return {
          path: path.resolve(baseDir, relative.value),
          enabled,
          preserveSource: enabled,
        };
      });

    const canonicalRoot = (_name: string, locked: KnowledgeLockEntry): string =>
      computeExtensionPathsForLayout(
        path.join,
        ws.layout,
        extensionPathSourceFromLockEntry(locked),
        KNOWLEDGE_EXTENSION_DIR,
        locked.workspaceName,
      ).canonicalPath;

    const desiredCanonicalRoot = (
      node: { readonly name: string; readonly identity: string },
      locked: KnowledgeLockEntry | undefined,
    ) => {
      if (node.identity.startsWith("workspace:")) {
        return ws.layout.scope === "project"
          ? Effect.succeed(path.join(ws.layout.authoredRoot("knowledge"), node.name))
          : Effect.fail(
              makeAppError({
                code: "validation",
                detail: "User workspaces do not support workspace-authored Knowledge bundles",
              }),
            );
      }
      return locked === undefined
        ? Effect.fail(
            makeAppError({
              code: "conflict",
              detail: `Active external Knowledge bundle has no accepted resolution: ${node.name}`,
            }),
          )
        : Effect.succeed(canonicalRoot(node.name, locked));
    };

    const toProjectionBundle = (
      root: string,
      inspected: {
        readonly manifest: KnowledgeManifest;
        readonly inspection: KnowledgeInspection;
      },
    ): KnowledgeDiscoveryBundle => ({
      owner: inspected.manifest.owner,
      name: inspected.manifest.name,
      sourceDir: path.join(root, KNOWLEDGE_SOURCE_DIR),
      ...(inspected.manifest.description === undefined
        ? {}
        : { description: inspected.manifest.description }),
    });

    const activeKnowledgeNodes = () =>
      ws.getDesiredStateGraph().pipe(
        Effect.flatMap((graph) =>
          graph.complete
            ? Effect.succeed(
                graph.nodes
                  .filter(isSourcedDesiredExtension)
                  .filter((node) => node.type === "knowledge" && node.enabled),
              )
            : makeAppError({
                code: "conflict",
                detail:
                  "Knowledge desired state cannot be reconciled until pack and declaration problems are fixed",
              }),
        ),
      );

    const selectKnowledgeBundles = (
      graph: DesiredStateGraph,
      locked: Readonly<Record<string, KnowledgeLockEntry>>,
      configured: KnowledgeMap,
      config: ResolvedKnowledgeDiscoveryConfig,
      instructionFilesEnabled: boolean,
    ) =>
      Effect.forEach(
        graph.nodes.filter((node) => node.type === "knowledge" && node.enabled),
        (node) =>
          Effect.gen(function* () {
            const root = yield* desiredCanonicalRoot(node, locked[node.name]);
            const inspected = yield* inspectPackage(root);
            const workspaceInstructionEntry = configured[node.name]?.instructionEntry;
            const resolution = resolveKnowledgeInstructionEntry({
              bundleEnabled: node.enabled,
              instructionFilesEnabled,
              knowledgeInstructionsEnabled: config.instructions,
              ...(workspaceInstructionEntry === undefined ? {} : { workspaceInstructionEntry }),
              ...(inspected.manifest.instructionEntry === undefined
                ? {}
                : { manifestInstructionEntry: inspected.manifest.instructionEntry }),
            });
            return resolution.included ? [toProjectionBundle(root, inspected)] : [];
          }),
      ).pipe(Effect.map((bundles) => bundles.flat()));

    const resolveKnowledgeProjection = () =>
      Effect.gen(function* () {
        const graph = yield* ws.getDesiredStateGraph();
        const locked = yield* getKnowledgeLockEntries(ws);
        const configured = yield* ws.getConfiguredKnowledgeEntries();
        const config = yield* ws.getKnowledgeDiscoveryConfig();
        const instructionsTarget = yield* getInstructionsTarget();
        return { graph, locked, configured, config, instructionsTarget };
      });

    const runKnowledgeProjectionAdapter = (args: {
      readonly bundles: ReadonlyArray<KnowledgeDiscoveryBundle>;
      readonly config: ResolvedKnowledgeDiscoveryConfig;
      readonly instructionsTarget: {
        readonly path: string;
        readonly enabled: boolean;
        readonly preserveSource: boolean;
      };
      readonly dryRun?: boolean;
    }) =>
      provide(
        reconcileKnowledgeDiscovery({
          scopeRoot: baseDir,
          config: args.config,
          bundles: args.bundles,
          instructionsPath: args.instructionsTarget.path,
          instructionManagementEnabled: args.instructionsTarget.enabled,
          preserveInstructionsSource: args.instructionsTarget.preserveSource,
          ...(args.dryRun === undefined ? {} : { dryRun: args.dryRun }),
        }),
      );

    const makeKnowledgeProjectionPlan = (): Effect.Effect<ProjectionPlan, AppError> =>
      Effect.gen(function* () {
        const { graph, locked, configured, config, instructionsTarget } =
          yield* resolveKnowledgeProjection();
        return yield* planAggregateProjection({
          unitId: "knowledge:discovery-region",
          targetFile: instructionsTarget.path,
          graph,
          select: (completeGraph) =>
            selectKnowledgeBundles(
              completeGraph,
              locked,
              configured,
              config,
              instructionsTarget.enabled,
            ),
          adapter: {
            observe: (input) =>
              runKnowledgeProjectionAdapter({
                bundles: input.contributors,
                config,
                instructionsTarget,
                dryRun: true,
              }).pipe(
                Effect.map((result) => ({
                  unitId: "knowledge:discovery-region",
                  path: `${instructionsTarget.path}#knowledge`,
                  owner: KNOWLEDGE_REGION_OWNER,
                  present: Option.isSome(result.observedRegion),
                  current: !result.changed,
                  expectedContributors: input.contributors.map(
                    ({ owner, name }) => `${owner}/knowledge/${name}`,
                  ),
                  observedContributors: Option.match(result.observedRegion, {
                    onNone: () => [],
                    onSome: observedKnowledgeContributors,
                  }),
                })),
              ),
            apply: (input) =>
              runKnowledgeProjectionAdapter({
                bundles: input.contributors,
                config,
                instructionsTarget,
              }).pipe(Effect.asVoid),
          },
        });
      });

    const projectionPlans = () => makeKnowledgeProjectionPlan().pipe(Effect.map((plan) => [plan]));

    const applyKnowledgeProjection = projectionPlans().pipe(Effect.flatMap(applyProjectionPlans));

    const reconcileDiscovery = (options?: { readonly dryRun?: boolean }) =>
      resolveKnowledgeProjection().pipe(
        Effect.flatMap(({ graph, locked, configured, config, instructionsTarget }) =>
          requireCompleteGraph(graph).pipe(
            Effect.flatMap((completeGraph) =>
              selectKnowledgeBundles(
                completeGraph,
                locked,
                configured,
                config,
                instructionsTarget.enabled,
              ),
            ),
            Effect.flatMap((bundles) =>
              runKnowledgeProjectionAdapter({
                bundles,
                config,
                instructionsTarget,
                ...(options?.dryRun === undefined ? {} : { dryRun: options.dryRun }),
              }),
            ),
          ),
        ),
      );

    const buildLockEntry = (
      ref: KnowledgeExtensionRef,
    ): Effect.Effect<Option.Option<KnowledgeLockEntry>, AppError> =>
      Effect.gen(function* () {
        const state = lastInstallState.get(ref.knowledge.name);
        switch (ref.refType) {
          case "registry":
            return state?.treeIntegrity === undefined
              ? yield* makeAppError({
                  code: "internal",
                  detail: `Knowledge ${ref.knowledge.name} has no materialized tree integrity`,
                })
              : Option.some(registryLockEntry(ref, state.treeIntegrity));
          case "git-hosted":
            return state?.treeIntegrity === undefined
              ? yield* makeAppError({
                  code: "internal",
                  detail: `Knowledge ${ref.knowledge.name} has no materialized content identity`,
                })
              : Option.some(gitLockEntry(ref, state.sourceHash, state.treeIntegrity));
          case "local":
            return state?.treeIntegrity === undefined
              ? yield* makeAppError({
                  code: "internal",
                  detail: `Knowledge ${ref.knowledge.name} has no materialized content identity`,
                })
              : Option.some(
                  localLockEntry(
                    ref,
                    state.relativeLocalSource,
                    state.sourceHash,
                    state.treeIntegrity,
                  ),
                );
          case "workspace":
            return Option.none();
        }
      });

    const setKnowledgeSourceEntry = (name: string, source: string) =>
      Effect.gen(function* () {
        const configured = yield* ws.getConfiguredKnowledgeEntries();
        const current = configured[name];
        yield* ws.setKnowledgeEntry(name, {
          source,
          enabled: true,
          ...(current?.instructionEntry === undefined
            ? {}
            : { instructionEntry: current.instructionEntry }),
        });
      });

    const restoreLockedPackage = (name: string, entry: KnowledgeLockEntry) =>
      Effect.gen(function* () {
        const ref = yield* knowledgeLockEntryToRef(name, entry, {
          baseDir,
          path,
          scope: ws.scope,
          getConfiguredSourceByName: ws.getConfiguredSourceByName,
        });
        if (ref.refType === "registry" && Option.isNone(ref.integrity)) {
          return yield* makeAppError({
            code: "unavailable",
            detail: `Locked registry Knowledge bundle has no integrity and cannot be restored: ${name}`,
          });
        }
        if (ref.refType !== "git-hosted") {
          return yield* preparePackage(ref);
        }
        const discovered = yield* sources.find(ref.source, {
          names: [name],
          type: "knowledge",
          owner: Option.none(),
          versionRange: Option.none(),
        });
        const candidate = discovered.find(
          (item): item is GitHostedKnowledgeRef =>
            item.type === "knowledge" && item.refType === "git-hosted",
        );
        if (
          candidate === undefined ||
          candidate.gitTreeSha !== ref.gitTreeSha ||
          candidate.gitCommitSha !== ref.gitCommitSha
        ) {
          return yield* makeAppError({
            code: "unavailable",
            detail: `Git Knowledge source no longer resolves to locked commit/tree ${ref.gitCommitSha}/${ref.gitTreeSha}: ${name}`,
          });
        }
        return yield* preparePackage(candidate);
      });

    const syncLocked = (
      dryRun: boolean,
    ): Effect.Effect<KnowledgeSyncResult, ReturnType<typeof makeAppError>, Scope.Scope> =>
      Effect.gen(function* () {
        const desired = yield* activeKnowledgeNodes();
        const locked = yield* getKnowledgeLockEntries(ws);
        const prepared: Array<PreparedKnowledgePackage> = [];
        for (const node of desired) {
          const { name } = node;
          const entry = locked[name];
          const root = yield* desiredCanonicalRoot(node, entry);
          const inspection = yield* Effect.result(inspectPackage(root));
          if (Result.isSuccess(inspection)) continue;
          if (node.identity.startsWith("workspace:")) {
            return yield* makeAppError({
              code: "validation",
              detail: `Active workspace-authored Knowledge bundle is missing or invalid: ${name}`,
              cause: inspection.failure,
            });
          }
          if (entry === undefined) {
            return yield* makeAppError({
              code: "conflict",
              detail: `Active external Knowledge bundle has no accepted resolution: ${name}`,
            });
          }
          const restored = yield* Effect.result(restoreLockedPackage(name, entry));
          if (Result.isFailure(restored)) {
            yield* Effect.forEach([...prepared].reverse(), (item) => item.rollback, {
              discard: true,
            });
            return yield* makeAppError({
              code: "unavailable",
              detail: `Active Knowledge bundle could not be restored: ${name}. ${restored.failure.detail}`,
              cause: restored.failure,
            });
          } else prepared.push(restored.success);
        }
        const discovered = yield* Effect.result(reconcileDiscovery({ dryRun: true }));
        if (Result.isFailure(discovered)) {
          yield* Effect.forEach([...prepared].reverse(), (item) => item.rollback, {
            discard: true,
          });
          return yield* discovered.failure;
        }
        if (!dryRun) yield* applyKnowledgeProjection;
        yield* Effect.forEach(
          dryRun ? [...prepared].reverse() : prepared,
          (item) => (dryRun ? item.rollback : item.commit),
          { discard: true },
        );
        const discovery = discovered.success;
        return {
          changed: prepared.length > 0 || discovery.changed,
          warnings: [],
          artifacts: discovery.artifacts,
        };
      });

    const installAtomically = (args: {
      readonly ref: KnowledgeExtensionRef;
      readonly versionRange: Option.Option<VersionRange>;
      readonly deferProjection?: boolean;
    }) =>
      ws
        .runTransaction({
          transition: Effect.gen(function* () {
            const name = args.ref.knowledge.name;
            const relativeLocalSource =
              args.ref.refType === "local"
                ? makeWorkspaceRelativeSourcePath(
                    path,
                    baseDir,
                    args.ref.sourcePath ?? stripFileProtocol(args.ref.location),
                  )
                : Option.none<string>();
            if (args.ref.refType === "local" && Option.isNone(relativeLocalSource)) {
              return yield* makeAppError({
                code: "validation",
                detail: `Local knowledge source must stay within the workspace: ${args.ref.source.path}`,
              });
            }
            const cleanupSupersededCanonical = yield* provide(
              prepareAcceptedCanonicalTransition({
                workspace: ws,
                type: "knowledge",
                name,
                ref: args.ref,
              }),
            );
            const prepared = yield* preparePackage(args.ref);
            const committed = yield* Effect.gen(function* () {
              lastInstallState.set(name, {
                relativeLocalSource,
                sourceHash: prepared.sourceHash,
                ...(prepared.treeIntegrity === undefined
                  ? {}
                  : { treeIntegrity: prepared.treeIntegrity }),
              });
              if (args.ref.refType !== "workspace" && prepared.treeIntegrity === undefined) {
                return yield* makeAppError({
                  code: "internal",
                  detail: `Knowledge ${name} has no staged tree integrity`,
                });
              }
              const lockEntry = yield* buildLockEntry(args.ref);
              if (Option.isSome(lockEntry)) {
                yield* ws.setKnowledge({
                  name,
                  lockEntry: lockEntry.value,
                  versionRange: args.versionRange,
                });
              } else {
                yield* setKnowledgeSourceEntry(name, "workspace");
              }
              yield* cleanupSupersededCanonical;
              return { name };
            });
            if (args.deferProjection !== true) yield* applyKnowledgeProjection;
            // The workspace transaction owns a nested scope. Settle the staged
            // package before that scope closes; a later postcondition failure
            // still restores the transaction snapshot.
            yield* prepared.commit;
            return committed;
          }),
          validate: ({ name }) =>
            isObservedInstalled(ws, "knowledge", name).pipe(
              Effect.flatMap((installed) =>
                installed
                  ? Effect.void
                  : makeAppError({
                      code: "internal",
                      detail: `Installed Knowledge bundle "${name}" did not satisfy its observable contract`,
                    }),
              ),
            ),
        })
        .pipe(surfaceRestorationIncomplete)
        .pipe(
          Effect.scoped,
          Effect.tapError(() =>
            Effect.sync(() => {
              lastInstallState.delete(args.ref.knowledge.name);
            }),
          ),
          Effect.asVoid,
        );

    // Canonical removal only. The shared operation flow re-renders the
    // discovery region after settings and lock removal, once the target has
    // left the graph.
    const materializeUninstall: ExtensionManager<KnowledgeExtensionRef>["materializeUninstall"] =
      Effect.fn("KnowledgeManager.materializeUninstall")(function* ({ target }) {
        const canonical = yield* provide(
          acceptedCanonicalObservation({
            workspace: ws,
            type: "knowledge",
            name: target.name,
          }),
        );
        const root = removableAcceptedCanonicalPath(canonical);
        const locked = yield* ws.getLockedKnowledgeEntry(target.name);
        const ownedRoot = Option.orElse(root, () =>
          Option.map(locked, (entry) => canonicalRoot(target.name, entry)),
        );
        if (Option.isSome(ownedRoot)) {
          yield* protectWorkspacePath(ownedRoot.value);
          yield* fs.remove(ownedRoot.value, { recursive: true, force: true }).pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: "internal",
                detail: `Failed to remove Knowledge package source: ${ownedRoot.value}`,
                cause: error,
              }),
            ),
          );
        }
      }, Effect.asVoid);
    // Deactivation retains canonical content; the caller updates settings
    // first, so re-rendering the whole region drops this bundle's routing.
    const materializeDeactivate: ExtensionManager<KnowledgeExtensionRef>["materializeDeactivate"] =
      Effect.fn("KnowledgeManager.materializeDeactivate")(() => applyKnowledgeProjection);

    return {
      type: "knowledge",
      projectionPlans,
      runTransaction: ws.runTransaction,
      refreshCatalog: () =>
        ws
          .runTransaction({
            transition: applyKnowledgeProjection,
            validate: () => Effect.void,
          })
          .pipe(surfaceRestorationIncomplete),
      sync: ({ dryRun }) =>
        dryRun
          ? Effect.scoped(syncLocked(true))
          : Effect.scoped(
              ws
                .runTransaction({
                  transition: syncLocked(false),
                  validate: () => Effect.void,
                })
                .pipe(surfaceRestorationIncomplete),
            ),
      install: installAtomically,
      isInstalled: ({ target }: { readonly target: ExtensionTarget }) =>
        isObservedInstalled(ws, "knowledge", target.name),
      materializeInstall: Effect.fn("KnowledgeManager.materializeInstall")(
        function* ({ ref, force }) {
          const relativeLocalSource =
            ref.refType === "local"
              ? makeWorkspaceRelativeSourcePath(
                  path,
                  baseDir,
                  ref.sourcePath ?? stripFileProtocol(ref.location),
                )
              : Option.none<string>();
          if (ref.refType === "local" && Option.isNone(relativeLocalSource)) {
            return yield* makeAppError({
              code: "validation",
              detail: `Local knowledge source must stay within the workspace: ${ref.source.path}`,
            });
          }
          const prepared = yield* preparePackage(ref, force === true);
          yield* prepared.commit;
          lastInstallState.set(ref.knowledge.name, {
            relativeLocalSource,
            sourceHash: prepared.sourceHash,
            ...(prepared.treeIntegrity === undefined
              ? {}
              : { treeIntegrity: prepared.treeIntegrity }),
          });
        },
        Effect.asVoid,
        Effect.scoped,
      ),
      prepareSourceTransition: ({ ref }) =>
        provide(
          prepareAcceptedCanonicalTransition({
            workspace: ws,
            type: "knowledge",
            name: ref.knowledge.name,
            ref,
          }),
        ),
      getConfiguredSource: ({ target }) =>
        ws
          .getConfiguredKnowledgeEntries()
          .pipe(Effect.map((entries) => Option.fromUndefinedOr(entries[target.name]?.source))),
      listMaterializable: () =>
        Effect.gen(function* () {
          const nodes = yield* activeKnowledgeNodes();
          const releaseAgeEvaluation = yield* provide(
            makeConfiguredReleaseAgeEvaluation("enforce"),
          );
          return yield* Effect.scoped(
            Effect.forEach(
              nodes,
              (node) =>
                provide(
                  resolveConfiguredKnowledge(node.name, node.source, releaseAgeEvaluation),
                ).pipe(Effect.map(({ ref }) => ref)),
              { concurrency: "unbounded" },
            ),
          );
        }),
      materializeUninstall,
      materializeDeactivate,
      upsertSettingsEntry: ({ ref, versionRange }) =>
        buildLockEntry(ref).pipe(
          Effect.flatMap((lockEntry) =>
            Option.isSome(lockEntry)
              ? ws.setKnowledge({
                  name: ref.knowledge.name,
                  lockEntry: lockEntry.value,
                  versionRange,
                })
              : setKnowledgeSourceEntry(ref.knowledge.name, "workspace"),
          ),
        ),
      removeSettingsEntry: ({ target }) => ws.removeKnowledgeSettings(target.name),
      upsertLockfileEntry: ({ ref }) =>
        buildLockEntry(ref).pipe(
          Effect.flatMap((lockEntry) => {
            if (Option.isNone(lockEntry)) return ws.removeKnowledgeLock(ref.knowledge.name);
            const validate =
              lockEntry.value.type === "registry"
                ? validateExactResolvedVersion(
                    `knowledge.${ref.knowledge.name}.resolvedVersion`,
                    lockEntry.value.resolvedVersion,
                  )
                : Effect.void;
            return validate.pipe(
              Effect.flatMap(() =>
                ws.setKnowledgeLock({
                  name: ref.knowledge.name,
                  lockEntry: lockEntry.value,
                  versionRange: Option.none(),
                }),
              ),
            );
          }),
        ),
      removeLockfileEntry: ({ target }) => ws.removeKnowledgeLock(target.name),
    } satisfies KnowledgeManagerService;
  }),
);
