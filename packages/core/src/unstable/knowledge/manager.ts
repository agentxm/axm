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
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
  canReuseInstalledPackage,
  materializeExternalPackage,
  materializeRegistryPackage,
  registryCanonicalMaterializationIdentity,
  parseExtensionFqnParts,
} from "../extensions/index.js";
import { computePackageContentHash } from "../extensions/package-hash.js";
import type { SourceHash } from "../extensions/rendered-files.js";
import type { KnowledgeLockEntry } from "../lockfile/index.js";
import { acceptedRegistryVersionForRef, validateExactResolvedVersion } from "../lockfile/index.js";
import { gitSourceLockFields } from "../lockfile/entry-fields.js";
import { SourceHostProviders } from "../source-resolution/index.js";
import { knowledgeLockEntryToRef, printSourceParams } from "../sources/index.js";
import { makeWorkspaceRelativeSourcePath } from "../utils/index.js";
import { makeWorkspaceRelativePath } from "../utils/path-types.js";
import { decodeVersionSync } from "../version-constraints/version-constraints.js";
import type { VersionRange } from "../version-constraints/version-constraints.js";
import {
  makeConfiguredReleaseAgeEvaluation,
  resolveConfiguredKnowledge,
} from "../workspace/configured-entry-resolution/index.js";
import { getKnowledgeLockEntries } from "../workspace/locked-entries.js";
import type { ExtensionManager, ExtensionTarget } from "../workspace/service-interface.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import { isObservedInstalled } from "../workspace/observed-installed.js";
import { acceptedCanonicalObservation } from "../workspace/accepted-canonical-ref.js";
import { protectWorkspacePath } from "../workspace/transaction.js";
import {
  KNOWLEDGE_EXTENSION_DIR,
  KNOWLEDGE_MANIFEST_FILENAME,
  KNOWLEDGE_SOURCE_DIR,
  KnowledgeManifestSchema,
  type KnowledgeManifest,
} from "./manifest-schema.js";
import { inspectKnowledgeBundle, type KnowledgeInspection } from "./okf.js";
import {
  reconcileKnowledgeDiscovery,
  type KnowledgeDiscoveryBundle,
  type KnowledgeDiscoveryResult,
} from "./discovery.js";
import type {
  GitHostedKnowledgeRef,
  KnowledgeExtensionRef,
  LocalKnowledgeRef,
  RegistryKnowledgeRef,
} from "./refs.js";

export interface KnowledgeManagerService extends ExtensionManager<KnowledgeExtensionRef> {
  readonly refreshCatalog: () => Effect.Effect<void, ReturnType<typeof makeAppError>>;
  readonly sync: (options: {
    readonly dryRun: boolean;
  }) => Effect.Effect<KnowledgeSyncResult, ReturnType<typeof makeAppError>>;
  readonly install: (args: {
    readonly ref: KnowledgeExtensionRef;
    readonly versionRange: Option.Option<VersionRange>;
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
  readonly commit: Effect.Effect<void, ReturnType<typeof makeAppError>>;
  readonly rollback: Effect.Effect<void, ReturnType<typeof makeAppError>>;
}

export class KnowledgeManager extends ServiceMap.Service<
  KnowledgeManager,
  KnowledgeManagerService
>()("@agentxm/client-core/unstable/knowledge/manager/KnowledgeManager") {}

const decodeManifest = Schema.decodeUnknownEffect(KnowledgeManifestSchema);
const registryLockEntry = (ref: RegistryKnowledgeRef): KnowledgeLockEntry => ({
  type: "registry",
  owner: ref.owner,
  name: ref.name,
  resolvedVersion: decodeVersionSync(ref.version),
  integrity: Option.getOrElse(ref.integrity, () => ""),
  sourceName: "default",
  publisherBindingId: ref.publisherBindingId,
});

const gitLockEntry = (
  ref: GitHostedKnowledgeRef,
  contentIdentity: SourceHash,
): KnowledgeLockEntry => ({
  ...gitSourceLockFields(ref.source, ref.gitCommitSha, ref.gitTreeSha, contentIdentity),
});

const localLockEntry = (
  ref: LocalKnowledgeRef,
  relativePath: Option.Option<string>,
  contentIdentity: SourceHash,
): KnowledgeLockEntry => ({
  type: "local",
  path: Option.getOrElse(relativePath, () => ref.source.path),
  contentIdentity,
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
      }
    >();

    const canonicalPathForRef = (ref: KnowledgeExtensionRef): string =>
      ref.refType === "registry" || ref.refType === "workspace"
        ? path.join(baseDir, REGISTRY_EXTENSIONS_DIR, ref.owner, KNOWLEDGE_EXTENSION_DIR, ref.name)
        : path.join(baseDir, EXTERNAL_EXTENSIONS_DIR, KNOWLEDGE_EXTENSION_DIR, ref.knowledge.name);

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
                publisherBindingId: ref.publisherBindingId,
                messages: {
                  integrityMismatchCode: "network",
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
          const lockedVersion = acceptedRegistryVersionForRef(
            yield* ws.getLockedKnowledgeEntry(ref.knowledge.name),
            ref,
          );
          const identity = registryCanonicalMaterializationIdentity({
            owner: ref.owner,
            type: "knowledge",
            name: ref.name,
            version: ref.version,
            publisherBindingId: ref.publisherBindingId,
            integrity: ref.integrity,
          });
          const reuse = yield* provide(
            canReuseInstalledPackage({
              installedPath: canonicalPath,
              force,
              identity,
              ...(lockedVersion === undefined ? {} : { lockedVersion }),
              existsFailureDetail: (target) => `Failed to inspect knowledge path: ${target}`,
            }),
          );
          if (reuse) {
            return {
              root: canonicalPath,
              sourceHash: yield* provide(computePackageContentHash(canonicalPath)),
              commit: Effect.void,
              rollback: Effect.void,
            };
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
        return {
          root: canonicalPath,
          sourceHash,
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

    const canonicalRoot = (name: string, locked: KnowledgeLockEntry): string =>
      locked.type === "registry"
        ? path.join(
            baseDir,
            REGISTRY_EXTENSIONS_DIR,
            locked.owner,
            KNOWLEDGE_EXTENSION_DIR,
            locked.name,
          )
        : path.join(baseDir, EXTERNAL_EXTENSIONS_DIR, KNOWLEDGE_EXTENSION_DIR, name);

    const desiredCanonicalRoot = (
      node: { readonly name: string; readonly identity: string },
      locked: KnowledgeLockEntry | undefined,
    ) => {
      if (node.identity.startsWith("workspace:")) {
        const identity = parseExtensionFqnParts(node.identity.slice("workspace:".length));
        return identity !== undefined && identity.type === "knowledge"
          ? Effect.succeed(
              path.join(
                baseDir,
                REGISTRY_EXTENSIONS_DIR,
                identity.owner,
                KNOWLEDGE_EXTENSION_DIR,
                identity.name,
              ),
            )
          : Effect.fail(
              makeAppError({
                code: "validation",
                detail: `Invalid workspace Knowledge identity: ${node.identity}`,
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
                graph.nodes.filter((node) => node.type === "knowledge" && node.enabled),
              )
            : makeAppError({
                code: "conflict",
                detail:
                  "Knowledge desired state cannot be reconciled until pack and declaration problems are fixed",
              }),
        ),
      );

    // The discovery region is an aggregate ownership unit: every write renders
    // the complete contributor set the complete desired-state graph reaches,
    // whether a bundle is declared directly or contributed by a Pack.
    //
    // With `onUnready: "skip"` a bundle whose accepted resolution or canonical
    // content is not yet readable defers the write: a later step in the same
    // closure completes it, and lint and sync detect the region if convergence
    // never happens. An incomplete desired-state graph always fails.
    const reconcileDiscovery = (options?: {
      readonly dryRun?: boolean;
      readonly onUnready?: "fail" | "skip";
    }) =>
      Effect.gen(function* () {
        const resolved = yield* Effect.result(
          Effect.gen(function* () {
            const desired = yield* activeKnowledgeNodes();
            const locked = yield* getKnowledgeLockEntries(ws);
            return yield* Effect.forEach(desired, (node) =>
              Effect.gen(function* () {
                const root = yield* desiredCanonicalRoot(node, locked[node.name]);
                return toProjectionBundle(root, yield* inspectPackage(root));
              }),
            );
          }),
        );
        if (Result.isFailure(resolved)) {
          if (options?.onUnready === "skip") {
            return { changed: false, artifacts: [] } satisfies KnowledgeDiscoveryResult;
          }
          return yield* resolved.failure;
        }
        const config = yield* ws.getKnowledgeDiscoveryConfig();
        const instructionsTarget = yield* getInstructionsTarget();
        return yield* provide(
          reconcileKnowledgeDiscovery({
            scopeRoot: baseDir,
            config,
            bundles: resolved.success,
            instructionsPath: instructionsTarget.path,
            instructionManagementEnabled: instructionsTarget.enabled,
            preserveInstructionsSource: instructionsTarget.preserveSource,
            ...(options?.dryRun === undefined ? {} : { dryRun: options.dryRun }),
          }),
        );
      });

    const buildLockEntry = (
      ref: KnowledgeExtensionRef,
    ): Effect.Effect<Option.Option<KnowledgeLockEntry>, AppError> =>
      Effect.gen(function* () {
        const state = lastInstallState.get(ref.knowledge.name);
        switch (ref.refType) {
          case "registry":
            return Option.some(registryLockEntry(ref));
          case "git-hosted":
            return state === undefined
              ? yield* makeAppError({
                  code: "internal",
                  detail: `Knowledge ${ref.knowledge.name} has no materialized content identity`,
                })
              : Option.some(gitLockEntry(ref, state.sourceHash));
          case "local":
            return state === undefined
              ? yield* makeAppError({
                  code: "internal",
                  detail: `Knowledge ${ref.knowledge.name} has no materialized content identity`,
                })
              : Option.some(localLockEntry(ref, state.relativeLocalSource, state.sourceHash));
          case "workspace":
            return Option.none();
        }
      });

    const restoreLockedPackage = (name: string, entry: KnowledgeLockEntry) =>
      Effect.gen(function* () {
        const ref = yield* knowledgeLockEntryToRef(name, entry, {
          baseDir,
          path,
          scope: ws.scope,
          getConfiguredSources: ws.getConfiguredSources,
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
        const discovered = yield* Effect.result(reconcileDiscovery({ dryRun }));
        if (Result.isFailure(discovered)) {
          yield* Effect.forEach([...prepared].reverse(), (item) => item.rollback, {
            discard: true,
          });
          return yield* discovered.failure;
        }
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
    }) =>
      ws
        .runTransaction({
          transition: Effect.gen(function* () {
            const name = args.ref.knowledge.name;
            const relativeLocalSource =
              args.ref.refType === "local"
                ? makeWorkspaceRelativeSourcePath(path, baseDir, args.ref.source.path)
                : Option.none<string>();
            if (args.ref.refType === "local" && Option.isNone(relativeLocalSource)) {
              return yield* makeAppError({
                code: "validation",
                detail: `Local knowledge source must stay within the workspace: ${args.ref.source.path}`,
              });
            }
            const prepared = yield* preparePackage(args.ref);
            const committed = yield* Effect.gen(function* () {
              lastInstallState.set(name, {
                relativeLocalSource,
                sourceHash: prepared.sourceHash,
              });
              const lockEntry = yield* buildLockEntry(args.ref);
              if (Option.isSome(lockEntry)) {
                yield* ws.setKnowledge({
                  name,
                  lockEntry: lockEntry.value,
                  versionRange: args.versionRange,
                });
              } else {
                yield* ws.setKnowledgeEntry(name, {
                  source: printSourceParams(args.ref.source),
                  enabled: true,
                });
              }
              return { name };
            });
            // Desired state and canonical content are committed; render the
            // discovery region once from the complete contributor set. A
            // sibling still installing in the same closure defers the write to
            // the closure's final reconcile.
            yield* reconcileDiscovery({ onUnready: "skip" });
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
        const root = Option.flatMap(canonical, (state) =>
          Option.fromUndefinedOr(state.observation.path),
        );
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
      Effect.fn("KnowledgeManager.materializeDeactivate")(
        () => reconcileDiscovery({ onUnready: "skip" }),
        Effect.asVoid,
      );

    return {
      type: "knowledge",
      runTransaction: ws.runTransaction,
      refreshCatalog: () =>
        ws.runTransaction({
          transition: reconcileDiscovery().pipe(Effect.asVoid),
          validate: () => Effect.void,
        }),
      sync: ({ dryRun }) =>
        dryRun
          ? Effect.scoped(syncLocked(true))
          : Effect.scoped(
              ws.runTransaction({
                transition: syncLocked(false),
                validate: () => Effect.void,
              }),
            ),
      install: installAtomically,
      reconcileProjections: () => reconcileDiscovery({ onUnready: "skip" }).pipe(Effect.asVoid),
      isInstalled: ({ target }: { readonly target: ExtensionTarget }) =>
        isObservedInstalled(ws, "knowledge", target.name),
      materializeInstall: Effect.fn("KnowledgeManager.materializeInstall")(
        function* ({ ref, force }) {
          const relativeLocalSource =
            ref.refType === "local"
              ? makeWorkspaceRelativeSourcePath(path, baseDir, ref.source.path)
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
          });
        },
        Effect.asVoid,
        Effect.scoped,
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
              : ws.setKnowledgeEntry(ref.knowledge.name, {
                  source: printSourceParams(ref.source),
                  enabled: true,
                }),
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
