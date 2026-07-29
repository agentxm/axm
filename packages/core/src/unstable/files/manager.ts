/**
 * files package manager service.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { makeAppError } from "../app-error/index.js";
import { makeWorkspaceRelativeSourcePath } from "../utils/index.js";
import {
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
  enabledConfiguredEntries,
  formatFqn,
  markerFqnForRef,
  materializeExternalPackage,
  materializeRegistryPackage,
} from "../extensions/index.js";
import { computePackageContentHash } from "../extensions/package-hash.js";
import { computeSourceHash, type SourceHash } from "../extensions/rendered-files.js";
import type { FilesLockEntry } from "../lockfile/index.js";
import {
  MaterializedFileTargetSchema,
  validateExactResolvedVersion,
  type MaterializedFileTarget,
} from "../lockfile/index.js";
import { commonLockFields, gitSourceLockFields } from "../lockfile/entry-fields.js";
import { SourceHostProviders } from "../source-resolution/index.js";
import {
  isWorkspaceSourceLocator,
  lockEntryToSourceParams,
  printSourceParams,
} from "../sources/index.js";
import type { ExtensionManager, FilesExtensionTarget } from "../workspace/service-interface.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import { resolveConfiguredFiles } from "../workspace/configured-entry-resolution/index.js";
import { makeWorkspaceRelativePath } from "../utils/path-types.js";
import { decodeVersionSync } from "../version-constraints/version-constraints.js";
import {
  FILES_MANIFEST_FILENAME,
  FILES_EXTENSION_DIR,
  FilesManifestSchema,
  type FilesExtensionRef,
  type FileInputValue,
  type FilesManifest,
  type GitHostedFilesRef,
  type LocalFilesRef,
  type RegistryFilesRef,
  type WorkspaceFilesRef,
  materializeFileEntry,
  renderFileContent,
  commentStyleForTarget,
  replaceManagedRegion,
  stripManagedRegion,
} from "./index.js";

export class FilesManager extends ServiceMap.Service<
  FilesManager,
  ExtensionManager<FilesExtensionRef>
>()("@agentxm/client-core/unstable/files/manager/FilesManager") {}

const decodeFilesManifest = Schema.decodeUnknownEffect(FilesManifestSchema);
const decodeMaterializedTarget = Schema.decodeUnknownSync(MaterializedFileTargetSchema);

const optionalSourceHash = (
  sourceHash: SourceHash | undefined,
): { readonly sourceHash?: SourceHash } => (sourceHash === undefined ? {} : { sourceHash });

const registryFilesLockEntry = (
  ref: RegistryFilesRef,
  now: DateTime.Utc,
  resolvedInputs: Readonly<Record<string, FileInputValue>>,
  sourceHash: SourceHash | undefined,
): FilesLockEntry => ({
  type: "registry",
  owner: ref.owner,
  name: ref.name,
  resolvedVersion: decodeVersionSync(ref.version),
  integrity: Option.getOrElse(ref.integrity, () => ""),
  sourceName: "default",
  publisherBindingId: ref.publisherBindingId,
  resolvedInputs,
  ...commonLockFields(now),
  ...optionalSourceHash(sourceHash),
});

const gitFilesLockEntry = (
  ref: GitHostedFilesRef,
  now: DateTime.Utc,
  resolvedInputs: Readonly<Record<string, FileInputValue>>,
  sourceHash: SourceHash | undefined,
): FilesLockEntry => ({
  ...gitSourceLockFields(ref.source, ref.gitTreeSha),
  resolvedInputs,
  ...commonLockFields(now),
  ...optionalSourceHash(sourceHash),
});

const localFilesLockEntry = (
  ref: LocalFilesRef,
  now: DateTime.Utc,
  resolvedInputs: Readonly<Record<string, FileInputValue>>,
  workspaceRelativeLocalSourcePath: Option.Option<string>,
  sourceHash: SourceHash | undefined,
): FilesLockEntry => ({
  type: "local",
  path: Option.getOrElse(workspaceRelativeLocalSourcePath, () => ref.source.path),
  resolvedInputs,
  ...commonLockFields(now),
  ...optionalSourceHash(sourceHash),
});

const workspaceFilesLockEntry = (
  ref: WorkspaceFilesRef,
  now: DateTime.Utc,
  resolvedInputs: Readonly<Record<string, FileInputValue>>,
): FilesLockEntry => ({
  type: "workspace",
  owner: ref.owner,
  extensionType: "files",
  name: ref.name,
  version: ref.version,
  sourceHash: ref.sourceHash,
  resolvedInputs,
  ...commonLockFields(now),
});

const defaultInputs = (manifest: FilesManifest): Readonly<Record<string, FileInputValue>> => {
  const inputs: Record<string, FileInputValue> = {};
  for (const [name, declaration] of Object.entries(manifest.inputs ?? {})) {
    if ("default" in declaration && declaration.default !== undefined) {
      inputs[name] = declaration.default;
    }
  }
  return inputs;
};

const markerExtForRef = (ref: FilesExtensionRef, manifest: FilesManifest): string =>
  markerFqnForRef({ ref, manifest, type: "files", name: ref.file.name });

export const FilesManagerLive = Layer.effect(
  FilesManager,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sources = yield* SourceHostProviders;
    const baseDir = ws.baseDir;

    const fsPathLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
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
        readonly ref: FilesExtensionRef;
        readonly resolvedInputs: Readonly<Record<string, FileInputValue>>;
        readonly materializedTargets: ReadonlyArray<MaterializedFileTarget>;
        readonly workspaceRelativeLocalSourcePath: Option.Option<string>;
        readonly sourceHash: SourceHash;
      }
    >();

    const materializeFromRegistry = (ref: RegistryFilesRef, force: boolean) =>
      Effect.gen(function* () {
        const lockedEntry = yield* ws
          .getLockedFilesEntry(ref.name)
          .pipe(Effect.catch(() => Effect.succeed(Option.none())));
        const lockedVersion = Option.match(lockedEntry, {
          onNone: () => undefined,
          onSome: (entry) => (entry.type === "registry" ? entry.resolvedVersion : undefined),
        });
        return yield* provide(
          materializeRegistryPackage({
            baseDir,
            canonicalPath: path.join(
              baseDir,
              REGISTRY_EXTENSIONS_DIR,
              ref.owner,
              FILES_EXTENSION_DIR,
              ref.name,
            ),
            sourceLocation: ref.source.location,
            owner: ref.owner,
            type: "files",
            name: ref.name,
            version: ref.version,
            integrity: ref.integrity,
            force,
            ...(lockedVersion === undefined ? {} : { lockedVersion }),
            messages: {
              existsFailureDetail: (canonicalPath) =>
                `Failed to check if canonical files package path exists: ${canonicalPath}`,
              integrityMismatchCode: "network",
              integrityMismatchDetail: `Integrity mismatch for file:${ref.name}@${ref.version}`,
              tempDirectoryFailureDetail:
                "Temporary directory for registry file install could not be created",
              createDirectoryFailureDetail: (canonicalPath) =>
                `Failed to create canonical files package directory: ${canonicalPath}`,
              inspectExtractedFailureDetail: "Extracted files package directory could not be read",
              copyEntryFailureCode: "validation",
              copyEntryFailureDetail: (entry) =>
                `Failed to copy registry files package entry: ${entry}`,
            },
          }),
        );
      });

    const materializeFromExternal = (ref: GitHostedFilesRef | LocalFilesRef) =>
      provide(
        materializeExternalPackage({
          baseDir,
          canonicalPath: path.join(
            baseDir,
            EXTERNAL_EXTENSIONS_DIR,
            FILES_EXTENSION_DIR,
            ref.file.name,
          ),
          sourceLocation: ref.location,
          copyFailureCode: "validation",
          copyFailureDetail: (canonicalPath) =>
            `Failed to copy files package files to ${canonicalPath}`,
        }),
      );

    const materializePackage = (ref: FilesExtensionRef, force = false) =>
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
              FILES_EXTENSION_DIR,
              ref.name,
            );
            if (
              ref.scope !== ws.scope ||
              path.resolve(ref.location) !== path.resolve(expectedPath)
            ) {
              return yield* makeAppError({
                code: "validation",
                detail: `Invalid workspace files source location: ${ref.location}`,
              });
            }
            return ref.location;
          }
        }
      });

    const readManifest = (packageRoot: string) =>
      fs.readFileString(path.join(packageRoot, FILES_MANIFEST_FILENAME)).pipe(
        Effect.flatMap((content) =>
          Effect.try({
            try: (): unknown => JSON.parse(content),
            catch: (error) =>
              makeAppError({
                code: "validation",
                detail: `Failed to parse ${FILES_MANIFEST_FILENAME}`,
                cause: error,
              }),
          }),
        ),
        Effect.flatMap((content) => decodeFilesManifest(content)),
        Effect.mapError((error) =>
          makeAppError({
            code: "validation",
            detail: `Failed to read ${FILES_MANIFEST_FILENAME}`,
            cause: error,
          }),
        ),
      );

    const markerExtForLockedTarget = (name: string, lockEntry: FilesLockEntry) =>
      Effect.gen(function* () {
        if (lockEntry.type === "registry" || lockEntry.type === "workspace") {
          return formatFqn({ owner: lockEntry.owner, type: "files", name: lockEntry.name });
        }
        const packageRoot = path.join(baseDir, EXTERNAL_EXTENSIONS_DIR, FILES_EXTENSION_DIR, name);
        const manifest = yield* readManifest(packageRoot).pipe(Effect.option);
        return Option.match(manifest, {
          onNone: () => `file:${name}`,
          onSome: (value) => formatFqn({ owner: value.owner, type: "files", name: value.name }),
        });
      });

    const materializeManagedRegion = (args: {
      readonly packageRoot: string;
      readonly manifest: FilesManifest;
      readonly ref: FilesExtensionRef;
      readonly entry: Extract<
        FilesManifest["contents"][number],
        { readonly mode: "managed-region" }
      >;
      readonly templateFiles: {
        readonly inputs: Readonly<Record<string, FileInputValue>>;
        readonly vars: Readonly<Record<string, FileInputValue>>;
        readonly workspace: { readonly root: string };
      };
    }) =>
      Effect.gen(function* () {
        const style = commentStyleForTarget(args.entry.target);
        if (Option.isNone(style)) {
          return yield* makeAppError({
            code: "validation",
            detail: `File target does not support managed regions: ${args.entry.target}`,
          });
        }

        const relative = makeWorkspaceRelativePath(path, baseDir, args.entry.target);
        if (Option.isNone(relative)) {
          return yield* makeAppError({
            code: "validation",
            detail: `files package target escapes workspace: ${args.entry.target}`,
          });
        }

        const absoluteTarget = path.resolve(baseDir, relative.value);
        const rendered = yield* provide(
          renderFileContent({
            packageRoot: args.packageRoot,
            source: args.entry.source,
            templateFiles: args.templateFiles,
            generatedFiles: {
              target: args.entry.target,
              ownRegion: {
                region: args.entry.region,
                ext: markerExtForRef(args.ref, args.manifest),
              },
            },
          }),
        );
        const existing = yield* fs
          .readFileString(absoluteTarget)
          .pipe(Effect.catch(() => Effect.succeed("")));
        const updated = replaceManagedRegion({
          content: existing,
          marker: { region: args.entry.region, ext: markerExtForRef(args.ref, args.manifest) },
          rendered,
          style: style.value,
        });
        yield* fs.makeDirectory(path.dirname(absoluteTarget), { recursive: true }).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "internal",
              detail: `Failed to create files target directory: ${path.dirname(absoluteTarget)}`,
              cause: error,
            }),
          ),
        );
        yield* fs.writeFileString(absoluteTarget, updated).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "internal",
              detail: `Failed to write files package managed region target: ${absoluteTarget}`,
              cause: error,
            }),
          ),
        );

        return decodeMaterializedTarget({
          target: relative.value,
          mode: "managed-region",
          region: args.entry.region,
          renderHash: computeSourceHash(rendered),
        });
      });

    const materializeInstall: ExtensionManager<FilesExtensionRef>["materializeInstall"] = Effect.fn(
      "FilesManager.materializeInstall",
    )(function* ({ ref, force }) {
      const packageRoot = yield* materializePackage(ref, force === true);
      const manifest = yield* readManifest(packageRoot);
      const entries = yield* ws.getConfiguredFilesEntries();
      const entry = entries[ref.file.name];
      const resolvedInputs = { ...defaultInputs(manifest), ...(entry?.inputs ?? {}) };
      const vars = yield* ws.getWorkspaceVars();
      const templateFiles = { inputs: resolvedInputs, vars, workspace: { root: baseDir } };
      const materializedTargets = yield* Effect.forEach(
        manifest.contents,
        (contentEntry) =>
          contentEntry.mode === "managed-region"
            ? provide(
                materializeManagedRegion({
                  packageRoot,
                  manifest,
                  ref,
                  entry: contentEntry,
                  templateFiles,
                }),
              )
            : provide(
                materializeFileEntry({
                  packageRoot,
                  workspaceRoot: baseDir,
                  entry: contentEntry,
                  templateFiles,
                }),
              ).pipe(Effect.map((result) => result.target)),
        { concurrency: 1 },
      );

      const workspaceRelativeLocalSourcePath =
        ref.refType === "local"
          ? makeWorkspaceRelativeSourcePath(path, baseDir, ref.source.path)
          : Option.none<string>();
      if (ref.refType === "local" && Option.isNone(workspaceRelativeLocalSourcePath)) {
        return yield* makeAppError({
          code: "validation",
          detail: `Local file source path must stay within the workspace root: ${ref.source.path}`,
        });
      }

      const sourceHash = yield* provide(computePackageContentHash(packageRoot));
      lastInstallState.set(ref.file.name, {
        ref,
        resolvedInputs,
        materializedTargets,
        workspaceRelativeLocalSourcePath,
        sourceHash,
      });
    }, Effect.asVoid);

    const buildLockEntry = (ref: FilesExtensionRef): Effect.Effect<FilesLockEntry, never> =>
      Effect.gen(function* () {
        const state = lastInstallState.get(ref.file.name);
        const resolvedInputs = state?.resolvedInputs ?? {};
        const now = yield* DateTime.now;
        switch (ref.refType) {
          case "registry":
            return registryFilesLockEntry(ref, now, resolvedInputs, state?.sourceHash);
          case "git-hosted":
            return gitFilesLockEntry(ref, now, resolvedInputs, state?.sourceHash);
          case "local":
            return localFilesLockEntry(
              ref,
              now,
              resolvedInputs,
              state?.workspaceRelativeLocalSourcePath ?? Option.none(),
              state?.sourceHash,
            );
          case "workspace":
            return workspaceFilesLockEntry(ref, now, resolvedInputs);
        }
      });

    const materializeUninstall: ExtensionManager<FilesExtensionRef>["materializeUninstall"] =
      Effect.fn("FilesManager.materializeUninstall")(function* ({ target, preserveSource }) {
        const locked = yield* ws.getLockedFilesEntry(target.name);
        if (Option.isNone(locked)) return;
        const packageRoot =
          locked.value.type === "registry" || locked.value.type === "workspace"
            ? path.join(
                baseDir,
                REGISTRY_EXTENSIONS_DIR,
                locked.value.owner,
                FILES_EXTENSION_DIR,
                locked.value.name,
              )
            : path.join(baseDir, EXTERNAL_EXTENSIONS_DIR, FILES_EXTENSION_DIR, target.name);
        const manifest = yield* readManifest(packageRoot).pipe(Effect.option);
        const markerExt = yield* markerExtForLockedTarget(target.name, locked.value);
        for (const contentEntry of Option.match(manifest, {
          onNone: () => [],
          onSome: (value) => value.contents,
        })) {
          if (contentEntry.mode === "sync-once") continue;
          const relativeTarget = makeWorkspaceRelativePath(path, baseDir, contentEntry.target);
          if (Option.isNone(relativeTarget)) continue;
          const absoluteTarget = path.resolve(baseDir, relativeTarget.value);
          if (contentEntry.mode === "sync-always") {
            yield* fs.remove(absoluteTarget).pipe(Effect.catch(() => Effect.void));
            continue;
          }
          if (!("region" in contentEntry)) continue;
          const style = commentStyleForTarget(contentEntry.target);
          if (Option.isNone(style)) continue;
          const existing = yield* fs
            .readFileString(absoluteTarget)
            .pipe(Effect.catch(() => Effect.succeed("")));
          const updated = stripManagedRegion(
            existing,
            { region: contentEntry.region, ext: markerExt },
            style.value,
          );
          yield* fs.writeFileString(absoluteTarget, updated).pipe(Effect.catch(() => Effect.void));
        }
        if (preserveSource !== true) {
          yield* fs.remove(packageRoot, { recursive: true }).pipe(Effect.ignore);
        }
      }, Effect.asVoid);

    return {
      type: "files",
      isInstalled: ({ target }: { readonly target: FilesExtensionTarget }) =>
        ws.getLockedFilesEntry(target.name).pipe(
          Effect.map((locked) => Option.isSome(locked)),
          Effect.withSpan("FilesManager.isInstalled"),
        ),

      materializeInstall,
      getLastMaterialization: ({ target }) =>
        Effect.succeed({
          agents: [],
          targets: (lastInstallState.get(target.name)?.materializedTargets ?? []).map(
            (materializedTarget) => ({ path: materializedTarget.target }),
          ),
        }),
      getConfiguredSource: Effect.fn("FilesManager.getConfiguredSource")(function* ({ target }) {
        const configured = yield* ws.getConfiguredFilesEntries();
        return Option.fromUndefinedOr(configured[target.name]?.source);
      }),

      listMaterializable: Effect.fn("FilesManager.listMaterializable")(function* () {
        const configured = yield* ws.getConfiguredFilesEntries();
        const refs = yield* Effect.scoped(
          Effect.forEach(
            enabledConfiguredEntries(configured),
            ([name, entry]) =>
              provide(resolveConfiguredFiles(name, entry.source)).pipe(
                Effect.map(({ ref }) => ref),
              ),
            { concurrency: "unbounded" },
          ),
        );
        return refs;
      }),

      materializeUninstall,

      upsertSettingsEntry: Effect.fn("FilesManager.upsertSettingsEntry")(function* ({
        ref,
        versionRange,
      }) {
        const lockEntry = yield* buildLockEntry(ref);
        const entries = yield* ws.getConfiguredFilesEntries();
        const current = entries[ref.file.name];
        const source =
          current !== undefined && isWorkspaceSourceLocator(current.source)
            ? current.source
            : ref.refType === "registry"
              ? (() => {
                  const fqn = formatFqn({ owner: ref.owner, type: "files", name: ref.file.name });
                  return Option.isSome(versionRange) ? `${fqn}@${versionRange.value}` : fqn;
                })()
              : printSourceParams(lockEntryToSourceParams(lockEntry));
        yield* ws.setFilesEntry(ref.file.name, {
          source,
          enabled: true,
          inputs: current?.inputs ?? {},
        });
      }),

      removeSettingsEntry: ({ target }: { readonly target: FilesExtensionTarget }) =>
        ws
          .removeFilesSettings(target.name)
          .pipe(Effect.withSpan("FilesManager.removeSettingsEntry")),

      upsertLockfileEntry: Effect.fn("FilesManager.upsertLockfileEntry")(function* ({
        ref,
        retainedByPack,
      }) {
        const lockEntry = yield* buildLockEntry(ref);
        const retainedLockEntry =
          retainedByPack === true ? { ...lockEntry, retainedByPack: true } : lockEntry;
        if (retainedLockEntry.type === "registry") {
          yield* validateExactResolvedVersion(
            `files.${ref.file.name}.resolvedVersion`,
            retainedLockEntry.resolvedVersion,
          );
        }
        yield* ws.setFilesLock({
          name: ref.file.name,
          lockEntry: retainedLockEntry,
          versionRange: Option.none(),
        });
      }),

      removeLockfileEntry: ({ target }: { readonly target: FilesExtensionTarget }) =>
        ws.removeFilesLock(target.name).pipe(Effect.withSpan("FilesManager.removeLockfileEntry")),
    } satisfies ExtensionManager<FilesExtensionRef>;
  }),
);
