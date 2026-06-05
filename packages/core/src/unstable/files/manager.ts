/**
 * files package manager service.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { makeAppError } from "../app-error/index.js";
import {
  computeIntegrity,
  makeWorkspaceRelativeSourcePath,
  stripFileProtocol,
} from "../utils/index.js";
import {
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
  formatFqn,
} from "../extensions/index.js";
import { copyExtensionDirectory, validatePathSafety } from "../extensions/utils.js";
import { computeSourceHash } from "../extensions/rendered-files.js";
import type { FilesLockEntry, MaterializedFileTarget } from "../lockfile/index.js";
import { MaterializedFileTargetSchema, validateExactResolvedVersion } from "../lockfile/index.js";
import { createRegistryClient, extractZip } from "../registry/index.js";
import { SourceHostProviders } from "../source-resolution/index.js";
import { lockEntryToSourceParams, printSourceParams } from "../sources/index.js";
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

const commonLockFields = (now: Date) => ({
  installedAt: now,
  updatedAt: now,
});

const optionalField = <K extends string, V>(key: K, value: Option.Option<V>): { [P in K]?: V } => {
  const fields: { [P in K]?: V } = {};
  if (Option.isSome(value)) fields[key] = value.value;
  return fields;
};

const registryFilesLockEntry = (
  ref: RegistryFilesRef,
  now: Date,
  resolvedInputs: Readonly<Record<string, FileInputValue>>,
  materializedTargets: ReadonlyArray<MaterializedFileTarget>,
): FilesLockEntry => ({
  type: "registry",
  owner: ref.owner,
  name: ref.name,
  resolvedVersion: decodeVersionSync(ref.version),
  integrity: Option.getOrElse(ref.integrity, () => ""),
  sourceName: "default",
  resolvedInputs,
  materializedTargets,
  ...commonLockFields(now),
});

const gitFilesLockEntry = (
  ref: GitHostedFilesRef,
  now: Date,
  resolvedInputs: Readonly<Record<string, FileInputValue>>,
  materializedTargets: ReadonlyArray<MaterializedFileTarget>,
): FilesLockEntry => {
  const common = {
    resolvedInputs,
    materializedTargets,
    ...commonLockFields(now),
  };

  switch (ref.source.type) {
    case "github":
      return {
        type: "github",
        owner: ref.source.owner,
        repo: ref.source.repo,
        ...optionalField("ref", ref.source.ref),
        ...optionalField("path", ref.source.subPath),
        ...optionalField("gitTreeHash", ref.gitTreeSha),
        ...common,
      };
    case "gitlab":
      return {
        type: "gitlab",
        owner: ref.source.owner,
        repo: ref.source.repo,
        ...optionalField("ref", ref.source.ref),
        ...optionalField("path", ref.source.subPath),
        ...optionalField("gitTreeHash", ref.gitTreeSha),
        ...common,
      };
    case "bitbucket":
      return {
        type: "bitbucket",
        owner: ref.source.owner,
        repo: ref.source.repo,
        ...optionalField("ref", ref.source.ref),
        ...optionalField("path", ref.source.subPath),
        ...optionalField("gitTreeHash", ref.gitTreeSha),
        ...common,
      };
    case "azurerepos":
      return {
        type: "azurerepos",
        organization: ref.source.organization,
        project: ref.source.project,
        repo: ref.source.repo,
        ...optionalField("ref", ref.source.ref),
        ...optionalField("path", ref.source.subPath),
        ...optionalField("gitTreeHash", ref.gitTreeSha),
        ...common,
      };
    case "git":
      return {
        type: "git",
        url: ref.source.url.href,
        ...optionalField("ref", ref.source.ref),
        ...optionalField("gitTreeHash", ref.gitTreeSha),
        ...common,
      };
  }
};

const localFilesLockEntry = (
  ref: LocalFilesRef,
  now: Date,
  resolvedInputs: Readonly<Record<string, FileInputValue>>,
  materializedTargets: ReadonlyArray<MaterializedFileTarget>,
  workspaceRelativeLocalSourcePath: Option.Option<string>,
): FilesLockEntry => ({
  type: "local",
  path: Option.getOrElse(workspaceRelativeLocalSourcePath, () => ref.source.path),
  resolvedInputs,
  materializedTargets,
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
  ref.refType === "registry"
    ? formatFqn({ owner: ref.owner, type: "files", name: ref.file.name })
    : formatFqn({ owner: manifest.owner, type: "files", name: manifest.name });

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
      }
    >();

    const materializeFromRegistry = (ref: RegistryFilesRef) =>
      provide(
        Effect.gen(function* () {
          const canonicalPath = path.join(
            baseDir,
            REGISTRY_EXTENSIONS_DIR,
            ref.owner,
            FILES_EXTENSION_DIR,
            ref.name,
          );
          yield* validatePathSafety(baseDir, canonicalPath);

          const canonicalExists = yield* fs
            .exists(canonicalPath)
            .pipe(Effect.orElseSucceed(() => false));
          const useExisting = Option.isNone(ref.integrity) && canonicalExists;
          if (useExisting) return canonicalPath;

          const locationStr =
            ref.source.location.protocol === "file:"
              ? ref.source.location.pathname
              : ref.source.location.href;
          const client = yield* createRegistryClient(locationStr);
          const { archive } = yield* client.getExtensionPackage({
            owner: ref.owner,
            type: "files",
            name: ref.name,
            version: Option.some(ref.version),
          });

          if (Option.isSome(ref.integrity)) {
            const actualIntegrity = yield* computeIntegrity(archive);
            if (actualIntegrity !== ref.integrity.value) {
              return yield* makeAppError({
                code: "network",
                detail: `Integrity mismatch for file:${ref.name}@${ref.version}`,
              });
            }
          }

          const tmpDir = yield* fs.makeTempDirectory().pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: "validation",
                detail: "Temporary directory for registry file install could not be created",
                cause: error,
              }),
            ),
          );

          yield* Effect.ensuring(
            Effect.gen(function* () {
              yield* provide(extractZip(archive, tmpDir));
              yield* fs.remove(canonicalPath, { recursive: true }).pipe(Effect.ignore);
              yield* fs.makeDirectory(canonicalPath, { recursive: true }).pipe(
                Effect.mapError((error) =>
                  makeAppError({
                    code: "validation",
                    detail: `Failed to create canonical files package directory: ${canonicalPath}`,
                    cause: error,
                  }),
                ),
              );
              const entries = yield* fs.readDirectory(tmpDir).pipe(
                Effect.mapError((error) =>
                  makeAppError({
                    code: "validation",
                    detail: "Extracted files package directory could not be read",
                    cause: error,
                  }),
                ),
              );
              yield* Effect.forEach(
                entries,
                (entry) =>
                  fs
                    .copy(path.join(tmpDir, entry), path.join(canonicalPath, entry))
                    .pipe(Effect.ignore),
                { concurrency: "unbounded" },
              );
            }),
            fs.remove(tmpDir, { recursive: true }).pipe(Effect.ignore),
          );

          return canonicalPath;
        }),
      );

    const materializeFromExternal = (ref: GitHostedFilesRef | LocalFilesRef) =>
      provide(
        Effect.gen(function* () {
          const canonicalPath = path.join(
            baseDir,
            EXTERNAL_EXTENSIONS_DIR,
            FILES_EXTENSION_DIR,
            ref.file.name,
          );
          yield* validatePathSafety(baseDir, canonicalPath);
          const sourcePath = stripFileProtocol(ref.location);
          const isSelfCopy = path.resolve(sourcePath) === path.resolve(canonicalPath);
          if (!isSelfCopy) {
            yield* fs.remove(canonicalPath, { recursive: true }).pipe(Effect.ignore);
            yield* provide(
              copyExtensionDirectory(sourcePath, canonicalPath).pipe(
                Effect.mapError((error) =>
                  makeAppError({
                    code: "validation",
                    detail: `Failed to copy files package files to ${canonicalPath}`,
                    cause: error,
                  }),
                ),
              ),
            );
          }
          return canonicalPath;
        }),
      );

    const materializePackage = (ref: FilesExtensionRef) =>
      Effect.gen(function* () {
        switch (ref.refType) {
          case "registry":
            return yield* materializeFromRegistry(ref);
          case "git-hosted":
          case "local":
            return yield* materializeFromExternal(ref);
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
        if (lockEntry.type === "registry") {
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
    )(function* ({ ref }) {
      const packageRoot = yield* materializePackage(ref);
      const manifest = yield* readManifest(packageRoot);
      const entries = yield* ws.getConfiguredFilesEntries();
      const entry = entries[ref.file.name];
      const resolvedInputs = { ...defaultInputs(manifest), ...(entry?.inputs ?? {}) };
      const vars = yield* ws.getWorkspaceVars();
      const templateFiles = { inputs: resolvedInputs, vars, workspace: { root: baseDir } };
      const previous = yield* ws.getLockedFilesEntry(ref.file.name);
      const previousTargets = new Map(
        (Option.isSome(previous) ? (previous.value.materializedTargets ?? []) : []).map(
          (target) => [`${target.target}:${target.mode}:${target.region ?? ""}`, target],
        ),
      );

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
                  previousTarget: previousTargets.get(
                    `${contentEntry.target}:${contentEntry.mode}:`,
                  ),
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

      lastInstallState.set(ref.file.name, {
        ref,
        resolvedInputs,
        materializedTargets,
        workspaceRelativeLocalSourcePath,
      });
    }, Effect.asVoid);

    const buildLockEntry = (ref: FilesExtensionRef): Effect.Effect<FilesLockEntry, never> => {
      const state = lastInstallState.get(ref.file.name);
      const resolvedInputs = state?.resolvedInputs ?? {};
      const materializedTargets = state?.materializedTargets ?? [];
      const now = new Date();
      switch (ref.refType) {
        case "registry":
          return Effect.succeed(
            registryFilesLockEntry(ref, now, resolvedInputs, materializedTargets),
          );
        case "git-hosted":
          return Effect.succeed(gitFilesLockEntry(ref, now, resolvedInputs, materializedTargets));
        case "local":
          return Effect.succeed(
            localFilesLockEntry(
              ref,
              now,
              resolvedInputs,
              materializedTargets,
              state?.workspaceRelativeLocalSourcePath ?? Option.none(),
            ),
          );
      }
    };

    const materializeUninstall: ExtensionManager<FilesExtensionRef>["materializeUninstall"] =
      Effect.fn("FilesManager.materializeUninstall")(function* ({ target }) {
        const locked = yield* ws.getLockedFilesEntry(target.name);
        if (Option.isNone(locked)) return;
        const markerExt = yield* markerExtForLockedTarget(target.name, locked.value);
        for (const materializedTarget of locked.value.materializedTargets ?? []) {
          if (materializedTarget.mode === "sync-once") continue;
          const absoluteTarget = path.resolve(baseDir, materializedTarget.target);
          if (materializedTarget.mode === "sync-always") {
            yield* fs.remove(absoluteTarget).pipe(Effect.catch(() => Effect.void));
            continue;
          }
          if (materializedTarget.region === undefined) continue;
          const style = commentStyleForTarget(materializedTarget.target);
          if (Option.isNone(style)) continue;
          const existing = yield* fs
            .readFileString(absoluteTarget)
            .pipe(Effect.catch(() => Effect.succeed("")));
          const updated = stripManagedRegion(
            existing,
            { region: materializedTarget.region, ext: markerExt },
            style.value,
          );
          yield* fs.writeFileString(absoluteTarget, updated).pipe(Effect.catch(() => Effect.void));
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

      listMaterializable: Effect.fn("FilesManager.listMaterializable")(function* () {
        const configured = yield* ws.getConfiguredFilesEntries();
        const refs = yield* Effect.scoped(
          Effect.forEach(
            Object.entries(configured).filter(([, entry]) => entry.enabled),
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
          current?.authored === true
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
          authored: current?.authored ?? false,
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
