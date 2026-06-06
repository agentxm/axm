/**
 * Hook manager service.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as ServiceMap from "effect/Context";
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser";
import { makeAppError, type AppError } from "../app-error/index.js";
import { computeSourceHash } from "../extensions/rendered-files.js";
import {
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
  formatFqn,
} from "../extensions/index.js";
import { copyExtensionDirectory, validatePathSafety } from "../extensions/utils.js";
import { MaterializedFileTargetSchema, validateExactResolvedVersion } from "../lockfile/index.js";
import type { HookLockEntry, MaterializedFileTarget } from "../lockfile/index.js";
import { createRegistryClient, extractZip } from "../registry/index.js";
import { SourceHostProviders } from "../source-resolution/index.js";
import { lockEntryToSourceParams, printSourceParams } from "../sources/index.js";
import {
  computeIntegrity,
  makeWorkspaceRelativeSourcePath,
  stripFileProtocol,
} from "../utils/index.js";
import { runWithTransientFileBackup } from "../utils/transient-backup.js";
import { decodeRelativePathSync, makeWorkspaceRelativePath } from "../utils/path-types.js";
import { decodeVersionSync } from "../version-constraints/version-constraints.js";
import { resolveConfiguredHook } from "../workspace/configured-entry-resolution/index.js";
import type { ExtensionManager, HookExtensionTarget } from "../workspace/service-interface.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import {
  HOOK_EXTENSION_DIR,
  HOOK_MANIFEST_FILENAME,
  HookManifestSchema,
  type GitHostedHookRef,
  type HookBinding,
  type HookExtensionRef,
  type HookManifest,
  type LocalHookRef,
  type RegistryHookRef,
} from "./index.js";

export class HookManager extends ServiceMap.Service<
  HookManager,
  ExtensionManager<HookExtensionRef>
>()("@agentxm/client-core/unstable/hooks/manager/HookManager") {}

const CLAUDE_SETTINGS_PATH = ".claude/settings.json";
const decodeHookManifest = Schema.decodeUnknownEffect(HookManifestSchema);
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

const registryHookLockEntry = (
  ref: RegistryHookRef,
  now: Date,
  materializedTargets: ReadonlyArray<MaterializedFileTarget>,
): HookLockEntry => ({
  type: "registry",
  owner: ref.owner,
  name: ref.name,
  resolvedVersion: decodeVersionSync(ref.version),
  integrity: Option.getOrElse(ref.integrity, () => ""),
  sourceName: "default",
  materializedTargets,
  ...commonLockFields(now),
});

const gitHookLockEntry = (
  ref: GitHostedHookRef,
  now: Date,
  materializedTargets: ReadonlyArray<MaterializedFileTarget>,
): HookLockEntry => {
  const common = {
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

const localHookLockEntry = (
  ref: LocalHookRef,
  now: Date,
  materializedTargets: ReadonlyArray<MaterializedFileTarget>,
  workspaceRelativeLocalSourcePath: Option.Option<string>,
): HookLockEntry => ({
  type: "local",
  path: Option.getOrElse(workspaceRelativeLocalSourcePath, () => ref.source.path),
  materializedTargets,
  ...commonLockFields(now),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonConfig = (configPath: string, raw: string): Effect.Effect<unknown, AppError> =>
  Effect.sync(() => {
    const errors: Array<ParseError> = [];
    const parsed: unknown = parse(raw, errors, { allowTrailingComma: true });
    if (errors.length > 0) {
      throw errors;
    }
    return parsed;
  }).pipe(
    Effect.mapError((error) =>
      makeAppError({
        code: "validation",
        detail: `Invalid Claude Code hooks config JSON/JSONC: ${configPath}`,
        cause: error,
      }),
    ),
  );

const validateHooksShape = (configPath: string, parsed: unknown): Effect.Effect<void, AppError> => {
  if (!isRecord(parsed)) {
    return Effect.fail(
      makeAppError({
        code: "validation",
        detail: `Invalid Claude Code hooks config format: ${configPath}`,
      }),
    );
  }
  const hooks = parsed["hooks"];
  if (hooks !== undefined && !isRecord(hooks)) {
    return Effect.fail(
      makeAppError({
        code: "validation",
        detail: `Invalid Claude Code hooks config format: ${configPath} (hooks must be an object)`,
      }),
    );
  }
  return Effect.void;
};

const readExisting = (configPath: string): Effect.Effect<string, AppError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(configPath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) return "";
    return yield* fs.readFileString(configPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read Claude Code hooks config: ${configPath}`,
          cause: error,
        }),
      ),
    );
  });

const writeIfChanged = (
  configPath: string,
  oldRaw: string,
  newRaw: string,
): Effect.Effect<void, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    if (oldRaw === newRaw) return;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(path.dirname(configPath), { recursive: true }).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to create hooks config directory: ${path.dirname(configPath)}`,
          cause: error,
        }),
      ),
    );
    yield* runWithTransientFileBackup({
      sourcePath: configPath,
      oldRaw,
      newRaw,
      tempPrefix: "axm-hooks-config-backup-",
      operation: fs.writeFileString(configPath, newRaw).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "internal",
            detail: `Failed to write Claude Code hooks config: ${configPath}`,
            cause: error,
          }),
        ),
      ),
    });
  });

const isManagedHookCommand = (value: unknown): boolean =>
  isRecord(value) &&
  value["type"] === "command" &&
  typeof value["command"] === "string" &&
  value["command"].includes(".axm/extensions/");

const stripManagedHookGroups = (hooks: Record<string, unknown>): Record<string, unknown> => {
  const next: Record<string, unknown> = {};
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) {
      next[event] = groups;
      continue;
    }

    const retainedGroups: unknown[] = [];
    for (const group of groups) {
      if (!isRecord(group)) {
        retainedGroups.push(group);
        continue;
      }

      const groupHooks = group["hooks"];
      if (!Array.isArray(groupHooks)) {
        retainedGroups.push(group);
        continue;
      }

      const retainedHooks = groupHooks.filter((entry) => !isManagedHookCommand(entry));
      if (retainedHooks.length > 0) {
        retainedGroups.push({ ...group, hooks: retainedHooks });
      }
    }

    if (retainedGroups.length > 0) {
      next[event] = retainedGroups;
    }
  }
  return next;
};

const interpreterForRuntime = (runtime: HookManifest["runtime"]): string => {
  switch (runtime) {
    case "bash":
      return "bash";
    case "node":
      return "node";
    case "python":
      return "python";
  }
};

const appendClaudeHookBinding = (
  hooks: Record<string, unknown>,
  binding: HookBinding,
  command: string,
  timeoutMs: number | undefined,
): void => {
  const existingGroups = hooks[binding.event];
  const groups = Array.isArray(existingGroups) ? [...existingGroups] : [];
  const commandEntry: Record<string, unknown> = {
    type: "command",
    command,
  };
  if (timeoutMs !== undefined) {
    commandEntry["timeout"] = Math.ceil(timeoutMs / 1000);
  }

  const group: Record<string, unknown> = {
    hooks: [commandEntry],
  };
  if (binding.matcher !== undefined) {
    group["matcher"] = binding.matcher;
  }
  groups.push(group);
  hooks[binding.event] = groups;
};

const updateHooksJson = (
  configPath: string,
  raw: string,
  renderedHooks: Record<string, unknown>,
): Effect.Effect<string, AppError> =>
  Effect.gen(function* () {
    const initial = raw.trim().length === 0 ? "{}\n" : raw;
    const parsed = yield* parseJsonConfig(configPath, initial);
    yield* validateHooksShape(configPath, parsed);
    const existingHooks =
      isRecord(parsed) && isRecord(parsed["hooks"]) ? stripManagedHookGroups(parsed["hooks"]) : {};

    for (const [event, groups] of Object.entries(renderedHooks)) {
      const existingGroups = existingHooks[event];
      existingHooks[event] = Array.isArray(existingGroups)
        ? [...existingGroups, groups].flat()
        : groups;
    }

    const hooksKeys = Object.keys(existingHooks);
    const edits = modify(initial, ["hooks"], hooksKeys.length === 0 ? undefined : existingHooks, {
      formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
    });
    return applyEdits(initial, edits);
  });

export const HookManagerLive = Layer.effect(
  HookManager,
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
        readonly ref: HookExtensionRef;
        readonly materializedTargets: ReadonlyArray<MaterializedFileTarget>;
        readonly workspaceRelativeLocalSourcePath: Option.Option<string>;
      }
    >();

    const materializeFromRegistry = (ref: RegistryHookRef) =>
      provide(
        Effect.gen(function* () {
          const canonicalPath = path.join(
            baseDir,
            REGISTRY_EXTENSIONS_DIR,
            ref.owner,
            HOOK_EXTENSION_DIR,
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
            type: "hook",
            name: ref.name,
            version: Option.some(ref.version),
          });

          if (Option.isSome(ref.integrity)) {
            const actualIntegrity = yield* computeIntegrity(archive);
            if (actualIntegrity !== ref.integrity.value) {
              return yield* makeAppError({
                code: "network",
                detail: `Integrity mismatch for hook:${ref.name}@${ref.version}`,
              });
            }
          }

          const tmpDir = yield* fs.makeTempDirectory().pipe(
            Effect.mapError((error) =>
              makeAppError({
                code: "validation",
                detail: "Temporary directory for registry hook install could not be created",
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
                    code: "internal",
                    detail: `Failed to create registry hook directory: ${canonicalPath}`,
                    cause: error,
                  }),
                ),
              );
              const entries = yield* fs.readDirectory(tmpDir).pipe(
                Effect.mapError((error) =>
                  makeAppError({
                    code: "internal",
                    detail: "Failed to inspect extracted registry hook package",
                    cause: error,
                  }),
                ),
              );
              yield* Effect.forEach(
                entries,
                (entry) =>
                  fs.copy(path.join(tmpDir, entry), path.join(canonicalPath, entry)).pipe(
                    Effect.mapError((error) =>
                      makeAppError({
                        code: "internal",
                        detail: `Failed to copy registry hook package entry: ${entry}`,
                        cause: error,
                      }),
                    ),
                  ),
                { concurrency: "unbounded" },
              );
            }),
            fs.remove(tmpDir, { recursive: true }).pipe(Effect.ignore),
          );

          return canonicalPath;
        }),
      );

    const materializeFromExternal = (ref: GitHostedHookRef | LocalHookRef) =>
      provide(
        Effect.gen(function* () {
          const canonicalPath = path.join(
            baseDir,
            EXTERNAL_EXTENSIONS_DIR,
            HOOK_EXTENSION_DIR,
            ref.hook.name,
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
                    detail: `Failed to copy hook package files to ${canonicalPath}`,
                    cause: error,
                  }),
                ),
              ),
            );
          }
          return canonicalPath;
        }),
      );

    const materializePackage = (ref: HookExtensionRef) =>
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
      fs.readFileString(path.join(packageRoot, HOOK_MANIFEST_FILENAME)).pipe(
        Effect.flatMap((content) =>
          Effect.try({
            try: (): unknown => JSON.parse(content),
            catch: (error) =>
              makeAppError({
                code: "validation",
                detail: `Failed to parse ${HOOK_MANIFEST_FILENAME}`,
                cause: error,
              }),
          }),
        ),
        Effect.flatMap((content) => decodeHookManifest(content)),
        Effect.mapError((error) =>
          makeAppError({
            code: "validation",
            detail: `Failed to read ${HOOK_MANIFEST_FILENAME}`,
            cause: error,
          }),
        ),
      );

    const entrypointPath = (packageRoot: string, manifest: HookManifest) =>
      Effect.gen(function* () {
        const absolute = path.resolve(packageRoot, manifest.entrypoint);
        yield* validatePathSafety(packageRoot, absolute);
        const exists = yield* fs.exists(absolute).pipe(Effect.orElseSucceed(() => false));
        if (!exists) {
          return yield* makeAppError({
            code: "validation",
            detail: `Hook entrypoint does not exist: ${manifest.entrypoint}`,
          });
        }
        const workspaceRelative = makeWorkspaceRelativePath(path, baseDir, absolute);
        if (Option.isNone(workspaceRelative)) {
          return yield* makeAppError({
            code: "validation",
            detail: `Hook entrypoint escapes workspace: ${manifest.entrypoint}`,
          });
        }
        return workspaceRelative.value;
      });

    const markerForRef = (ref: HookExtensionRef, manifest: HookManifest): string =>
      ref.refType === "registry"
        ? formatFqn({ owner: ref.owner, type: "hook", name: ref.hook.name })
        : formatFqn({ owner: manifest.owner, type: "hook", name: manifest.name });

    const renderHookRef = (args: {
      readonly ref: HookExtensionRef;
      readonly packageRoot: string;
    }) =>
      Effect.gen(function* () {
        const manifest = yield* readManifest(args.packageRoot);
        const entrypoint = yield* entrypointPath(args.packageRoot, manifest);
        const command = `${interpreterForRuntime(manifest.runtime)} ${entrypoint}`;
        return {
          name: args.ref.hook.name,
          marker: markerForRef(args.ref, manifest),
          manifest,
          command,
        };
      });

    const renderInstalledHookGroups = (args?: {
      readonly include?: {
        readonly ref: HookExtensionRef;
        readonly packageRoot: string;
      };
      readonly excludeName?: string;
    }) =>
      Effect.gen(function* () {
        const configured = yield* ws.getConfiguredHookEntries();
        const renderedHooks = yield* Effect.forEach(
          Object.entries(configured).filter(
            ([name, entry]) =>
              entry.enabled && name !== args?.excludeName && name !== args?.include?.ref.hook.name,
          ),
          ([name, entry]) =>
            Effect.scoped(provide(resolveConfiguredHook(name, entry.source))).pipe(
              Effect.flatMap(({ ref }) =>
                Effect.gen(function* () {
                  const packageRoot = yield* materializePackage(ref);
                  return yield* renderHookRef({ ref, packageRoot });
                }),
              ),
            ),
          { concurrency: "unbounded" },
        );

        const included = args?.include === undefined ? [] : [yield* renderHookRef(args.include)];
        const sorted = [...renderedHooks, ...included].sort((a, b) =>
          a.marker.localeCompare(b.marker),
        );
        const hooks: Record<string, unknown> = {};
        for (const rendered of sorted) {
          for (const binding of rendered.manifest.bindings) {
            appendClaudeHookBinding(hooks, binding, rendered.command, rendered.manifest.timeoutMs);
          }
        }
        return hooks;
      });

    const writeHooksConfig = (args?: {
      readonly include?: {
        readonly ref: HookExtensionRef;
        readonly packageRoot: string;
      };
      readonly excludeName?: string;
    }) =>
      Effect.gen(function* () {
        const rendered = yield* renderInstalledHookGroups(args);
        const configPath = path.resolve(baseDir, CLAUDE_SETTINGS_PATH);
        const raw = yield* provide(readExisting(configPath));
        const next = yield* updateHooksJson(configPath, raw, rendered);
        yield* provide(writeIfChanged(configPath, raw, next));

        return decodeMaterializedTarget({
          target: decodeRelativePathSync(CLAUDE_SETTINGS_PATH),
          mode: "sync-always",
          renderHash: computeSourceHash(JSON.stringify(rendered)),
        });
      });

    const materializeInstall: ExtensionManager<HookExtensionRef>["materializeInstall"] = Effect.fn(
      "HookManager.materializeInstall",
    )(function* ({ ref }) {
      const packageRoot = yield* materializePackage(ref);
      yield* readManifest(packageRoot);

      const workspaceRelativeLocalSourcePath =
        ref.refType === "local"
          ? makeWorkspaceRelativeSourcePath(path, baseDir, ref.source.path)
          : Option.none<string>();
      if (ref.refType === "local" && Option.isNone(workspaceRelativeLocalSourcePath)) {
        return yield* makeAppError({
          code: "validation",
          detail: `Local hook source path must stay within the workspace root: ${ref.source.path}`,
        });
      }

      const materializedTarget = yield* writeHooksConfig({ include: { ref, packageRoot } });
      lastInstallState.set(ref.hook.name, {
        ref,
        materializedTargets: [materializedTarget],
        workspaceRelativeLocalSourcePath,
      });
    }, Effect.asVoid);

    const buildLockEntry = (ref: HookExtensionRef): Effect.Effect<HookLockEntry, never> => {
      const state = lastInstallState.get(ref.hook.name);
      const materializedTargets = state?.materializedTargets ?? [];
      const now = new Date();
      switch (ref.refType) {
        case "registry":
          return Effect.succeed(registryHookLockEntry(ref, now, materializedTargets));
        case "git-hosted":
          return Effect.succeed(gitHookLockEntry(ref, now, materializedTargets));
        case "local":
          return Effect.succeed(
            localHookLockEntry(
              ref,
              now,
              materializedTargets,
              state?.workspaceRelativeLocalSourcePath ?? Option.none(),
            ),
          );
      }
    };

    const materializeUninstall: ExtensionManager<HookExtensionRef>["materializeUninstall"] =
      Effect.fn("HookManager.materializeUninstall")(function* ({ target }) {
        const locked = yield* ws.getLockedHookEntry(target.name);
        if (Option.isNone(locked)) return;
        const configured = yield* ws.getConfiguredHookEntries();
        const entryIsAuthored = configured[target.name]?.authored === true;
        yield* writeHooksConfig({ excludeName: target.name });

        const entry = locked.value;
        const packageRoot =
          entry.type === "registry"
            ? path.join(
                baseDir,
                REGISTRY_EXTENSIONS_DIR,
                entry.owner,
                HOOK_EXTENSION_DIR,
                entry.name,
              )
            : path.join(baseDir, EXTERNAL_EXTENSIONS_DIR, HOOK_EXTENSION_DIR, target.name);
        if (!entryIsAuthored) {
          yield* fs.remove(packageRoot, { recursive: true }).pipe(Effect.ignore);
        }
      }, Effect.asVoid);

    return {
      type: "hook",
      isInstalled: ({ target }: { readonly target: HookExtensionTarget }) =>
        ws.getLockedHookEntry(target.name).pipe(
          Effect.map((locked) => Option.isSome(locked)),
          Effect.withSpan("HookManager.isInstalled"),
        ),

      materializeInstall,

      listMaterializable: Effect.fn("HookManager.listMaterializable")(function* () {
        const configured = yield* ws.getConfiguredHookEntries();
        const refs = yield* Effect.scoped(
          Effect.forEach(
            Object.entries(configured).filter(([, entry]) => entry.enabled),
            ([name, entry]) =>
              provide(resolveConfiguredHook(name, entry.source)).pipe(Effect.map(({ ref }) => ref)),
            { concurrency: "unbounded" },
          ),
        );
        return refs;
      }),

      materializeUninstall,

      upsertSettingsEntry: Effect.fn("HookManager.upsertSettingsEntry")(function* ({
        ref,
        versionRange,
      }) {
        const lockEntry = yield* buildLockEntry(ref);
        const entries = yield* ws.getConfiguredHookEntries();
        const current = entries[ref.hook.name];
        const source =
          current?.authored === true
            ? current.source
            : ref.refType === "registry"
              ? (() => {
                  const fqn = formatFqn({ owner: ref.owner, type: "hook", name: ref.hook.name });
                  return Option.isSome(versionRange) ? `${fqn}@${versionRange.value}` : fqn;
                })()
              : printSourceParams(lockEntryToSourceParams(lockEntry));
        yield* ws.setHookEntry(ref.hook.name, {
          source,
          enabled: true,
          authored: current?.authored ?? false,
        });
      }),

      removeSettingsEntry: Effect.fn("HookManager.removeSettingsEntry")(function* ({ target }) {
        yield* ws.removeHookSettings(target.name);
      }),

      upsertLockfileEntry: Effect.fn("HookManager.upsertLockfileEntry")(function* ({
        ref,
        retainedByPack,
      }) {
        const lockEntry = yield* buildLockEntry(ref);
        const entry = retainedByPack === undefined ? lockEntry : { ...lockEntry, retainedByPack };
        if (ref.refType === "registry") {
          yield* validateExactResolvedVersion(
            `hooks.${ref.hook.name}.resolvedVersion`,
            ref.version,
          );
        }
        yield* ws.setHookLock({
          name: ref.hook.name,
          lockEntry: entry,
          versionRange: Option.none(),
        });
      }),

      removeLockfileEntry: Effect.fn("HookManager.removeLockfileEntry")(function* ({ target }) {
        yield* ws.removeHookLock(target.name);
      }),
    };
  }),
);
