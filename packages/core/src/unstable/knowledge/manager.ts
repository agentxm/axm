/** Lifecycle manager for isolated Open Knowledge Format bundles. */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/Context";
import * as Result from "effect/Result";
import { resolveInstructionsConfig } from "../agents/instructions.js";
import { makeAppError } from "../app-error/index.js";
import {
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
  enabledConfiguredEntries,
  materializeExternalPackage,
  materializeRegistryPackage,
} from "../extensions/index.js";
import type { KnowledgeLockEntry } from "../lockfile/index.js";
import { validateExactResolvedVersion } from "../lockfile/index.js";
import { commonLockFields, gitSourceLockFields } from "../lockfile/entry-fields.js";
import { SourceHostProviders } from "../source-resolution/index.js";
import { knowledgeLockEntryToRef } from "../sources/index.js";
import { makeWorkspaceRelativeSourcePath } from "../utils/index.js";
import { makeWorkspaceRelativePath } from "../utils/path-types.js";
import { decodeVersionSync } from "../version-constraints/version-constraints.js";
import type { VersionRange } from "../version-constraints/version-constraints.js";
import { resolveConfiguredKnowledge } from "../workspace/configured-entry-resolution/index.js";
import type { ExtensionManager, KnowledgeExtensionTarget } from "../workspace/service-interface.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import {
  KNOWLEDGE_EXTENSION_DIR,
  KNOWLEDGE_MANIFEST_FILENAME,
  KNOWLEDGE_SOURCE_DIR,
  KnowledgeManifestSchema,
  type KnowledgeManifest,
} from "./manifest-schema.js";
import { inspectKnowledgeBundle, type KnowledgeInspection } from "./okf.js";
import { reconcileKnowledgeProjection, type KnowledgeProjectionBundle } from "./projection.js";
import type {
  GitHostedKnowledgeRef,
  KnowledgeExtensionRef,
  LocalKnowledgeRef,
  RegistryKnowledgeRef,
  WorkspaceKnowledgeRef,
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
  readonly commit: Effect.Effect<void>;
  readonly rollback: Effect.Effect<void>;
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
  ...(ref.publisherBindingId === undefined ? {} : { publisherBindingId: ref.publisherBindingId }),
  ...commonLockFields(new Date()),
});

const gitLockEntry = (ref: GitHostedKnowledgeRef): KnowledgeLockEntry => ({
  ...gitSourceLockFields(ref.source, ref.gitTreeSha),
  ...commonLockFields(new Date()),
});

const localLockEntry = (
  ref: LocalKnowledgeRef,
  relativePath: Option.Option<string>,
): KnowledgeLockEntry => ({
  type: "local",
  path: Option.getOrElse(relativePath, () => ref.source.path),
  ...commonLockFields(new Date()),
});

const workspaceLockEntry = (ref: WorkspaceKnowledgeRef): KnowledgeLockEntry => ({
  type: "workspace",
  owner: ref.owner,
  extensionType: "knowledge",
  name: ref.name,
  version: ref.version,
  sourceHash: ref.sourceHash,
  ...commonLockFields(new Date()),
});

export const KnowledgeManagerLive = Layer.effect(
  KnowledgeManager,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sources = yield* SourceHostProviders;
    const baseDir = ws.baseDir;
    const env = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
      Layer.succeed(WorkspaceMutations, ws),
      Layer.succeed(SourceHostProviders, sources),
    );
    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, env);
    const lastInstallState = new Map<
      string,
      {
        readonly relativeLocalSource: Option.Option<string>;
      }
    >();

    const canonicalPathForRef = (ref: KnowledgeExtensionRef): string =>
      ref.refType === "registry" || ref.refType === "workspace"
        ? path.join(baseDir, REGISTRY_EXTENSIONS_DIR, ref.owner, KNOWLEDGE_EXTENSION_DIR, ref.name)
        : path.join(baseDir, EXTERNAL_EXTENSIONS_DIR, KNOWLEDGE_EXTENSION_DIR, ref.knowledge.name);

    const materializePackage = (
      ref: KnowledgeExtensionRef,
      options?: { readonly baseDir: string; readonly canonicalPath: string },
    ) => {
      const canonicalPath = options?.canonicalPath ?? canonicalPathForRef(ref);
      const materializationBaseDir = options?.baseDir ?? baseDir;
      switch (ref.refType) {
        case "registry":
          return provide(
            materializeRegistryPackage({
              baseDir: materializationBaseDir,
              canonicalPath,
              sourceLocation: ref.source.location,
              owner: ref.owner,
              type: "knowledge",
              name: ref.name,
              version: ref.version,
              integrity: ref.integrity,
              messages: {
                existsFailureDetail: (target) => `Failed to inspect knowledge path: ${target}`,
                integrityMismatchCode: "network",
                integrityMismatchDetail: `Integrity mismatch for knowledge:${ref.name}@${ref.version}`,
                tempDirectoryFailureDetail: "Temporary knowledge directory could not be created",
                createDirectoryFailureDetail: (target) =>
                  `Failed to create knowledge directory: ${target}`,
                inspectExtractedFailureDetail: "Failed to inspect extracted knowledge package",
                copyEntryFailureCode: "internal",
                copyEntryFailureDetail: (entry) =>
                  `Failed to copy knowledge package entry: ${entry}`,
              },
            }),
          );
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
            detail: errors.map((item) => item.message).join(" "),
          });
        }
        return { manifest, inspection };
      });

    const preparePackage = (
      ref: KnowledgeExtensionRef,
    ): Effect.Effect<PreparedKnowledgePackage, ReturnType<typeof makeAppError>> =>
      Effect.gen(function* () {
        const canonicalPath = canonicalPathForRef(ref);
        if (ref.refType === "workspace") {
          const root = yield* materializePackage(ref);
          yield* inspectPackage(root);
          return { root, commit: Effect.void, rollback: Effect.void };
        }
        const tempDir = yield* fs.makeTempDirectory({ prefix: "axm-knowledge-package-" });
        const stagedPath = path.join(tempDir, "staged");
        const backupPath = path.join(tempDir, "previous");
        const stagedRoot = yield* materializePackage(ref, {
          baseDir: tempDir,
          canonicalPath: stagedPath,
        });
        yield* inspectPackage(stagedRoot).pipe(
          Effect.tapError(() => fs.remove(tempDir, { recursive: true }).pipe(Effect.ignore)),
        );
        const hadCanonical = yield* fs.exists(canonicalPath);
        if (hadCanonical) yield* fs.rename(canonicalPath, backupPath);
        yield* fs.makeDirectory(path.dirname(canonicalPath), { recursive: true });
        yield* fs
          .rename(stagedPath, canonicalPath)
          .pipe(
            Effect.tapError(() =>
              hadCanonical ? fs.rename(backupPath, canonicalPath).pipe(Effect.ignore) : Effect.void,
            ),
          );
        return {
          root: canonicalPath,
          commit: fs.remove(tempDir, { recursive: true }).pipe(Effect.ignore),
          rollback: fs
            .remove(canonicalPath, { recursive: true })
            .pipe(
              Effect.ignore,
              Effect.andThen(
                hadCanonical
                  ? fs.rename(backupPath, canonicalPath).pipe(Effect.ignore)
                  : Effect.void,
              ),
              Effect.andThen(fs.remove(tempDir, { recursive: true }).pipe(Effect.ignore)),
            ),
        };
      }).pipe(
        Effect.mapError((cause) =>
          cause._tag === "AppError"
            ? cause
            : makeAppError({
                code: "internal",
                detail: `Failed to stage Knowledge bundle ${ref.knowledge.name}`,
                cause,
              }),
        ),
      );

    const getInstructionsPath = () =>
      Effect.gen(function* () {
        const config = yield* ws.getInstructionsConfig();
        const resolved = resolveInstructionsConfig(
          Option.isSome(config) && config.value !== false ? config.value : undefined,
        );
        const relative = makeWorkspaceRelativePath(path, baseDir, resolved.fileName);
        if (Option.isNone(relative)) {
          return yield* makeAppError({
            code: "validation",
            detail: `Knowledge discovery instruction target escapes workspace: ${resolved.fileName}`,
          });
        }
        return path.resolve(baseDir, relative.value);
      });

    const canonicalRoot = (name: string, locked: KnowledgeLockEntry): string =>
      locked.type === "registry" || locked.type === "workspace"
        ? path.join(
            baseDir,
            REGISTRY_EXTENSIONS_DIR,
            locked.owner,
            KNOWLEDGE_EXTENSION_DIR,
            locked.name,
          )
        : path.join(baseDir, EXTERNAL_EXTENSIONS_DIR, KNOWLEDGE_EXTENSION_DIR, name);

    const toProjectionBundle = (
      root: string,
      inspected: {
        readonly manifest: KnowledgeManifest;
        readonly inspection: KnowledgeInspection;
      },
    ): KnowledgeProjectionBundle => ({
      owner: inspected.manifest.owner,
      name: inspected.manifest.name,
      sourceDir: path.join(root, KNOWLEDGE_SOURCE_DIR),
      ...(inspected.manifest.description === undefined
        ? {}
        : { description: inspected.manifest.description }),
      version: inspected.manifest.version,
      conceptCount: inspected.inspection.concepts.length,
    });

    const reconcileProjection = (options?: {
      readonly include?: { readonly ref: KnowledgeExtensionRef; readonly root: string };
      readonly excludeName?: string;
      readonly dryRun?: boolean;
    }) =>
      Effect.gen(function* () {
        const configured = yield* ws.getConfiguredKnowledgeEntries();
        const locked = yield* ws.getLockedKnowledge();
        const installed = yield* Effect.forEach(
          enabledConfiguredEntries(configured).filter(
            ([name]) =>
              name !== options?.include?.ref.knowledge.name && name !== options?.excludeName,
          ),
          ([name]) =>
            Effect.gen(function* () {
              const lockEntry = locked[name];
              if (lockEntry === undefined) {
                return yield* makeAppError({
                  code: "validation",
                  detail: `Knowledge bundle is configured but not locked: ${name}`,
                  suggestions: [{ description: "Repair the workspace", cmd: "axm sync" }],
                });
              }
              const root = canonicalRoot(name, lockEntry);
              return toProjectionBundle(root, yield* inspectPackage(root));
            }),
        );
        const included =
          options?.include === undefined
            ? []
            : [
                toProjectionBundle(
                  options.include.root,
                  yield* inspectPackage(options.include.root),
                ),
              ];
        const config = yield* ws.getKnowledgeProjectionConfig();
        const instructionsPath = yield* getInstructionsPath();
        return yield* provide(
          reconcileKnowledgeProjection({
            scopeRoot: baseDir,
            axmDir: ws.path,
            config,
            bundles: [...installed, ...included],
            instructionsPath,
            ...(options?.dryRun === undefined ? {} : { dryRun: options.dryRun }),
          }),
        );
      });

    const buildLockEntry = (ref: KnowledgeExtensionRef): KnowledgeLockEntry => {
      const state = lastInstallState.get(ref.knowledge.name);
      switch (ref.refType) {
        case "registry":
          return registryLockEntry(ref);
        case "git-hosted":
          return gitLockEntry(ref);
        case "local":
          return localLockEntry(ref, state?.relativeLocalSource ?? Option.none());
        case "workspace":
          return workspaceLockEntry(ref);
      }
    };

    const restoreLockedPackage = (name: string, entry: KnowledgeLockEntry) =>
      Effect.gen(function* () {
        const ref = yield* knowledgeLockEntryToRef(name, entry, {
          baseDir,
          path,
          scope: ws.scope,
          getConfiguredSources: ws.getConfiguredSources,
          getConfiguredSourceByName: ws.getConfiguredSourceByName,
        });
        if (ref.refType === "workspace") {
          return yield* makeAppError({
            code: "unavailable",
            detail: `Workspace Knowledge source is missing or invalid: ${name}`,
          });
        }
        if (ref.refType === "registry" && Option.isNone(ref.integrity)) {
          return yield* makeAppError({
            code: "unavailable",
            detail: `Locked registry Knowledge bundle has no integrity and cannot be restored: ${name}`,
          });
        }
        if (ref.refType !== "git-hosted") {
          return yield* preparePackage(ref);
        }
        if (Option.isNone(ref.gitTreeSha)) {
          return yield* makeAppError({
            code: "unavailable",
            detail: `Locked git Knowledge bundle has no tree hash and cannot be restored: ${name}`,
          });
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
          Option.isNone(candidate.gitTreeSha) ||
          candidate.gitTreeSha.value !== ref.gitTreeSha.value
        ) {
          return yield* makeAppError({
            code: "unavailable",
            detail: `Git Knowledge source no longer resolves to locked tree ${ref.gitTreeSha.value}: ${name}`,
          });
        }
        return yield* preparePackage(candidate);
      });

    const syncLocked = (
      dryRun: boolean,
    ): Effect.Effect<KnowledgeSyncResult, ReturnType<typeof makeAppError>> =>
      Effect.gen(function* () {
        const configured = yield* ws.getConfiguredKnowledgeEntries();
        const locked = yield* ws.getLockedKnowledge();
        const warnings: Array<string> = [];
        const prepared: Array<PreparedKnowledgePackage> = [];
        for (const [name] of enabledConfiguredEntries(configured)) {
          const entry = locked[name];
          if (entry === undefined) {
            warnings.push(`Knowledge bundle is configured but not locked: ${name}`);
            continue;
          }
          const root = canonicalRoot(name, entry);
          const inspection = yield* Effect.result(inspectPackage(root));
          if (Result.isSuccess(inspection)) continue;
          if (dryRun) {
            warnings.push(`Knowledge bundle requires lock-backed restore: ${name}`);
            continue;
          }
          const restored = yield* Effect.result(Effect.scoped(restoreLockedPackage(name, entry)));
          if (Result.isFailure(restored)) warnings.push(restored.failure.detail);
          else prepared.push(restored.success);
        }
        if (warnings.length > 0) {
          yield* Effect.forEach(prepared, (item) => item.commit, { discard: true });
          return { changed: prepared.length > 0, warnings, artifacts: [] };
        }
        const projected = yield* Effect.result(reconcileProjection({ dryRun }));
        if (Result.isFailure(projected)) {
          yield* Effect.forEach([...prepared].reverse(), (item) => item.rollback, {
            discard: true,
          });
          return yield* projected.failure;
        }
        yield* Effect.forEach(prepared, (item) => item.commit, { discard: true });
        const projection = projected.success;
        return {
          changed: projection.changed,
          warnings,
          artifacts: projection.artifacts,
        };
      });

    const installAtomically = (args: {
      readonly ref: KnowledgeExtensionRef;
      readonly versionRange: Option.Option<VersionRange>;
    }) =>
      Effect.gen(function* () {
        const name = args.ref.knowledge.name;
        const previousConfigured = yield* ws.getConfiguredKnowledgeEntries();
        const previousEntry = Option.fromUndefinedOr(previousConfigured[name]);
        const previousLock = yield* ws.getLockedKnowledgeEntry(name);
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
        lastInstallState.set(name, { relativeLocalSource });
        const prepared = yield* preparePackage(args.ref);
        const rollbackMetadata = Effect.gen(function* () {
          if (Option.isSome(previousEntry)) yield* ws.setKnowledgeEntry(name, previousEntry.value);
          else yield* ws.removeKnowledgeSettings(name);
          if (Option.isSome(previousLock)) {
            yield* ws.setKnowledgeLock({
              name,
              lockEntry: previousLock.value,
              versionRange: Option.none(),
            });
          } else yield* ws.removeKnowledgeLock(name);
        }).pipe(Effect.ignore);
        const applied = yield* Effect.result(
          ws
            .setKnowledge({
              name,
              lockEntry: buildLockEntry(args.ref),
              versionRange: args.versionRange,
            })
            .pipe(
              Effect.andThen(
                reconcileProjection({
                  include: { ref: args.ref, root: prepared.root },
                  excludeName: name,
                }),
              ),
            ),
        );
        if (Result.isFailure(applied)) {
          yield* rollbackMetadata;
          yield* prepared.rollback;
          yield* reconcileProjection().pipe(Effect.ignore);
          return yield* applied.failure;
        }
        yield* prepared.commit;
      });

    return {
      type: "knowledge",
      refreshCatalog: () => reconcileProjection().pipe(Effect.asVoid),
      sync: ({ dryRun }) => syncLocked(dryRun),
      install: installAtomically,
      isInstalled: ({ target }: { readonly target: KnowledgeExtensionTarget }) =>
        ws.getLockedKnowledgeEntry(target.name).pipe(Effect.map(Option.isSome)),
      materializeInstall: Effect.fn("KnowledgeManager.materializeInstall")(function* ({ ref }) {
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
        const prepared = yield* preparePackage(ref);
        const projection = yield* Effect.result(
          reconcileProjection({ include: { ref, root: prepared.root } }),
        );
        if (Result.isFailure(projection)) {
          yield* prepared.rollback;
          return yield* projection.failure;
        }
        yield* prepared.commit;
        lastInstallState.set(ref.knowledge.name, { relativeLocalSource });
      }, Effect.asVoid),
      getConfiguredSource: ({ target }) =>
        ws
          .getConfiguredKnowledgeEntries()
          .pipe(Effect.map((entries) => Option.fromUndefinedOr(entries[target.name]?.source))),
      listMaterializable: () =>
        ws
          .getConfiguredKnowledgeEntries()
          .pipe(
            Effect.flatMap((entries) =>
              Effect.scoped(
                Effect.forEach(
                  enabledConfiguredEntries(entries),
                  ([name, entry]) =>
                    provide(resolveConfiguredKnowledge(name, entry.source)).pipe(
                      Effect.map(({ ref }) => ref),
                    ),
                  { concurrency: "unbounded" },
                ),
              ),
            ),
          ),
      materializeUninstall: Effect.fn("KnowledgeManager.materializeUninstall")(function* ({
        target,
        preserveSource,
      }) {
        const locked = yield* ws.getLockedKnowledgeEntry(target.name);
        if (Option.isNone(locked)) return;
        if (preserveSource !== true) {
          const root =
            locked.value.type === "registry" || locked.value.type === "workspace"
              ? path.join(
                  baseDir,
                  REGISTRY_EXTENSIONS_DIR,
                  locked.value.owner,
                  KNOWLEDGE_EXTENSION_DIR,
                  locked.value.name,
                )
              : path.join(baseDir, EXTERNAL_EXTENSIONS_DIR, KNOWLEDGE_EXTENSION_DIR, target.name);
          yield* fs.remove(root, { recursive: true }).pipe(Effect.ignore);
        }
        yield* reconcileProjection({ excludeName: target.name });
      }, Effect.asVoid),
      upsertSettingsEntry: ({ ref, versionRange }) => {
        const entry = buildLockEntry(ref);
        return ws.setKnowledge({ name: ref.knowledge.name, lockEntry: entry, versionRange });
      },
      removeSettingsEntry: ({ target }) => ws.removeKnowledgeSettings(target.name),
      upsertLockfileEntry: ({ ref, retainedByPack }) => {
        const entry = buildLockEntry(ref);
        const lockEntry = retainedByPack === undefined ? entry : { ...entry, retainedByPack };
        const validate =
          lockEntry.type === "registry"
            ? validateExactResolvedVersion(
                `knowledge.${ref.knowledge.name}.resolvedVersion`,
                lockEntry.resolvedVersion,
              )
            : Effect.void;
        return validate.pipe(
          Effect.flatMap(() =>
            ws.setKnowledgeLock({
              name: ref.knowledge.name,
              lockEntry,
              versionRange: Option.none(),
            }),
          ),
        );
      },
      removeLockfileEntry: ({ target }) => ws.removeKnowledgeLock(target.name),
    } satisfies KnowledgeManagerService;
  }),
);
