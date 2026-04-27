/**
 * Workspace context service implementation.
 *
 * This is the sole public gateway for all settings and lockfile read/write
 * operations. It reads through `WorkspaceContext` and calls the write I/O
 * functions (`writeSettings`, `writeLockfile`) directly while managing mutation
 * serialization via a single Semaphore(1). No other service should perform
 * settings or lockfile I/O in production; the per-service semaphores in
 * `settings/service.ts` and `lockfile/service.ts` have been removed.
 *
 * Supporting logic is split into focused modules:
 * - `taxonomy-types.ts` — workspace taxonomy type definitions
 * - `source-metadata.ts` — source metadata derivation helpers
 * - `initialization.ts` — workspace initialization (agent detection, settings creation)
 * - `classifier-records.ts` — classifier row → record map converters
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import {
  LOCKFILE_NAME,
  makeRegistryExtensionPackLockEntry,
  writeLockfile,
  type RegistryExtensionPackLockEntry,
  type SubagentsLockMap,
} from "../lockfile/index.js";
import type { Lockfile } from "../lockfile/schema.js";
import { computeSkillPaths } from "../skills/paths.js";
import { computeExtensionPackPaths } from "../packs/paths.js";
import { expandGlob } from "../utils/index.js";
import type { Handle } from "../extensions/handle.js";
import { sanitizeName } from "../extensions/utils.js";
import {
  AgentIdSchema,
  decodeExtensionNameSync,
  formatFqn,
  type ExtensionName,
  type InstallableExtensionType,
  parseFullyQualifiedNameParts,
  parseRegistrySourcePatternParts,
} from "../extensions/index.js";
import { type AppError, makeAppError } from "../app-error/index.js";
import {
  type CommandEntry,
  type CommandsMap,
  createDefaultSettings,
  DEFAULT_PROFILE,
  type McpServersMap,
  type SkillEntry,
  type SubagentEntry,
  type ExtensionPacksMap,
  type Settings,
  SETTINGS_FILENAME,
  type SkillsMap,
  type SubagentsMap,
  type SourceHostConfig,
  writeSettings,
} from "../settings/index.js";
import { lockEntryToSourceParams, printSourceParams } from "../sources/index.js";

type WorkspaceManagedExtensionType = InstallableExtensionType;
import { getAxmDir } from "./paths.js";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  WorkspaceContext,
  WorkspaceContextConfigTag,
  WorkspaceContextLive,
  type ScopedWorkspaceContext,
} from "./context/context.js";
import type {
  LockfileReadError,
  SettingsReadError,
  WorkspaceRootEscape,
} from "./context/errors.js";
import {
  Workspace,
  type WorkspaceContextOptions,
  type SetSkillArgs,
  type SetExtensionPackArgs,
  type SetCommandArgs,
  type SetMcpServerArgs,
  type SetSubagentArgs,
  type SkillPathSource,
  type ExtensionTarget,
} from "./service-interface.js";
import type { LockfileState } from "./augment-plan.js";
import { deriveSourceMetaFromLockType } from "./source-metadata.js";
import type { ClassifiedExtension, PackagingKind } from "./taxonomy-types.js";
import {
  toClassifiedCommandRecord,
  toClassifiedExtensionRefRecord,
  toClassifiedSkillRecord,
  toConfiguredCommandRecord,
  toConfiguredExternalCommandRecord,
  toConfiguredExternalExtensionRefRecord,
  toConfiguredExternalSkillRecord,
  toConfiguredExtensionRefRecord,
  toConfiguredSkillRecord,
  toImplicitCommandRecord,
  toImplicitExtensionRefRecord,
  toImplicitSkillRecord,
  toInstalledCommandRecord,
  toInstalledExtensionRefRecord,
  toInstalledSkillRecord,
  toUnmanagedCommandRecord,
  toUnmanagedExternalCommandRecord,
  toUnmanagedExternalExtensionRefRecord,
  toUnmanagedExternalSkillRecord,
  toUnmanagedExtensionRefRecord,
  toUnmanagedSkillRecord,
  toConfiguredSubagentRecord,
  toImplicitSubagentRecord,
  toInstalledSubagentRecord,
  toClassifiedSubagentRecord,
} from "./classifier-records.js";
const createEmptyLockfile = (): Lockfile => ({
  lockfileVersion: 1,
  skills: {},
});

const contextReadErrorToAppError = (
  source: "settings" | "lockfile" | "workspace",
  error: SettingsReadError | LockfileReadError | WorkspaceRootEscape,
): AppError =>
  makeAppError({
    code: source === "settings" ? "SETTINGS_PARSE_FAILED" : "LOCKFILE_PARSE_FAILED",
    what: `Failed to read workspace ${source}`,
    cause: error,
  });

const contextCellErrorToAppError = (
  error: SettingsReadError | LockfileReadError | WorkspaceRootEscape,
): AppError => {
  switch (error._tag) {
    case "LockfileIoError":
    case "LockfileParseError":
    case "LockfileDecodeError":
      return contextReadErrorToAppError("lockfile", error);
    case "SettingsIoError":
    case "SettingsParseError":
    case "SettingsDecodeError":
      return contextReadErrorToAppError("settings", error);
    case "WorkspaceRootEscape":
      return contextReadErrorToAppError("workspace", error);
  }
};

/**
 * Options for creating workspace context.
 */
export type WorkspaceLayerOptions = WorkspaceContextOptions;

/**
 * Create workspace context effect.
 *
 * Loads an existing workspace context from disk.
 *
 * The workspace must already be initialized. Missing or invalid settings fail
 * fast with an `AppError`.
 *
 * @param options - Workspace layer options
 * @returns Effect yielding WorkspaceContextService
 *
 * @internal Not exported from barrel - use layer() for external access
 */
const requireInitializedWorkspace = (
  settingsPath: string,
  settings: Effect.Effect<Option.Option<Settings>, AppError>,
) =>
  settings.pipe(
    Effect.flatMap(
      Option.match({
        onNone: () =>
          Effect.fail(
            makeAppError({
              code: "WORKSPACE_NOT_INITIALIZED",
              what: `Workspace settings not found: ${settingsPath}`,
              howToFix: "Run `axm setup` to create the workspace.",
            }),
          ),
        onSome: () => Effect.void,
      }),
    ),
  );

export const loadWorkspace = (options: WorkspaceLayerOptions) =>
  Effect.gen(function* () {
    const globalDir = yield* getAxmDir("user");
    const localDir = yield* getAxmDir("project", options.projectRoot);
    const workspaceDir = options.scope === "user" ? globalDir : localDir;

    // Capture FileSystem and Path for use in closures
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const semaphore = yield* Semaphore.make(1);
    const settingsPath = path.join(workspaceDir, SETTINGS_FILENAME);

    const baseDir = path.dirname(workspaceDir);

    const fsLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );
    const contextLayer = WorkspaceContextLive.pipe(
      Layer.provide(fsLayer),
      Layer.provide(
        Layer.succeed(WorkspaceContextConfigTag, {
          projectRoot: path.dirname(localDir),
          userHome: path.dirname(globalDir),
          allowedRoot: "/",
        }),
      ),
    );

    const scopeForDir = (dir: string): "project" | "user" =>
      dir === globalDir ? "user" : "project";

    const readSettingsCell = (dir: string) =>
      Effect.gen(function* () {
        const context = yield* WorkspaceContext;
        return yield* context.scope(scopeForDir(dir)).state.settings;
      }).pipe(
        Effect.provide(contextLayer),
        Effect.mapError((error) => contextReadErrorToAppError("settings", error)),
      );

    const readLockfileCell = (dir: string) =>
      Effect.gen(function* () {
        const context = yield* WorkspaceContext;
        return yield* context.scope(scopeForDir(dir)).state.lockfile;
      }).pipe(
        Effect.map(Option.getOrElse(createEmptyLockfile)),
        Effect.provide(contextLayer),
        Effect.mapError((error) => contextReadErrorToAppError("lockfile", error)),
      );

    yield* requireInitializedWorkspace(settingsPath, readSettingsCell(workspaceDir));

    // Built-in sources: parameterized via options, falling back to git forges only
    const builtInSources: ReadonlyArray<SourceHostConfig> = options.builtInSources ?? [
      { name: "github", type: "github", url: new URL("https://github.com") },
      { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
      { name: "bitbucket", type: "bitbucket", url: new URL("https://bitbucket.org") },
    ];

    // Mutable cache for merged sources (invalidated by addConfiguredSource)
    let cachedSources: ReadonlyArray<SourceHostConfig> | null = null;

    const withMutex = semaphore.withPermits(1);

    /**
     * Read settings from a directory, returning default settings if not found.
     */
    const readSettingsSafe = (dir: string) =>
      readSettingsCell(dir).pipe(Effect.map(Option.getOrElse(() => createDefaultSettings())));

    /**
     * Read lockfile from a directory, returning empty lockfile if not found.
     */
    const readLockfileSafe = (dir: string) => readLockfileCell(dir);

    /**
     * Look up `key` in `record`, failing with an `AppError` when absent.
     */
    const getEntryOrFail = <T>(
      record: Readonly<Record<string, T>>,
      key: string,
      code: AppError["code"],
      what: string,
    ): Effect.Effect<T, AppError> =>
      key in record && record[key] !== undefined
        ? Effect.succeed(record[key])
        : Effect.fail(makeAppError({ code, what }));

    /**
     * Probe lockfile state without mutating disk.
     */
    const getLockfileState = (): Effect.Effect<LockfileState, AppError> =>
      Effect.gen(function* () {
        const lockfilePath = path.join(workspaceDir, LOCKFILE_NAME);
        const exists = yield* fs.exists(lockfilePath).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "LOCKFILE_PARSE_FAILED",
              what: `Failed to check if lockfile exists at ${lockfilePath}`,
              cause: error,
            }),
          ),
        );

        if (!exists) {
          return "missing";
        }

        return yield* readLockfileSafe(workspaceDir).pipe(
          Effect.as("ok" as const),
          Effect.catch((error) => {
            if (
              error.code === "LOCKFILE_PARSE_FAILED" ||
              error.code === "LOCKFILE_RESOLVED_VERSION_INVALID"
            ) {
              return Effect.succeed("invalid" as const);
            }

            return Effect.fail(error);
          }),
        );
      }).pipe(Effect.withSpan("Workspace.getLockfileState"));

    // -----------------------------------------------------------------------
    // Classifier integration
    // -----------------------------------------------------------------------

    /**
     * Classify extensions from WorkspaceContext subject projections.
     */
    const packagingKindForSource = (
      type: WorkspaceManagedExtensionType,
      source: string,
    ): PackagingKind => {
      if (type === "pack") return "native";
      if (type === "skill") {
        return source.includes("/skills/") || source.startsWith("@") ? "native" : "non-native";
      }
      return source.includes("/") && source.startsWith("@") ? "native" : "non-native";
    };

    const packagingKindForResolved = (
      resolved: Option.Option<{ readonly lockEntry: { readonly type: string } }>,
      type: WorkspaceManagedExtensionType,
      source: string,
    ): PackagingKind =>
      Option.match(resolved, {
        onNone: () => packagingKindForSource(type, source),
        onSome: (row) => deriveSourceMetaFromLockType(row.lockEntry.type).packagingKind,
      });

    const isIgnoredName = (patterns: ReadonlyArray<string>, name: string): boolean =>
      patterns.some((pattern) => expandGlob(pattern, [name]).length > 0);

    const resolvedRowToImplicit = (
      type: WorkspaceManagedExtensionType,
      row: { readonly name: string; readonly lockEntry: { readonly type: string } },
    ): Option.Option<ClassifiedExtension> =>
      deriveSourceMetaFromLockType(row.lockEntry.type).packagingKind === "native"
        ? Option.some({
            type,
            name: row.name,
            source: Option.none(),
            enabled: true,
            packagingKind: "native",
            lifecycle: "implicit",
          })
        : Option.none();

    const packMemberNames = (
      packs: ReadonlyArray<{
        readonly lockEntry: {
          readonly resolvedSkills?: Readonly<Record<string, unknown>>;
          readonly resolvedCommands?: Readonly<Record<string, unknown>>;
          readonly resolvedMcpServers?: Readonly<Record<string, unknown>>;
          readonly resolvedSubagents?: Readonly<Record<string, unknown>>;
        };
      }>,
      key: "resolvedSkills" | "resolvedCommands" | "resolvedMcpServers" | "resolvedSubagents",
    ): ReadonlyArray<ExtensionName> => {
      const names: Array<ExtensionName> = [];
      for (const pack of packs) {
        const resolved = pack.lockEntry[key] ?? {};
        for (const fqn of Object.keys(resolved)) {
          const parsed = parseFullyQualifiedNameParts(fqn);
          if (parsed !== undefined) names.push(parsed.name);
        }
      }
      return [...new Set(names)].sort();
    };

    const packMemberToImplicit = (
      type: WorkspaceManagedExtensionType,
      name: ExtensionName,
    ): ClassifiedExtension => ({
      type,
      name,
      source: Option.none(),
      enabled: true,
      packagingKind: "native",
      lifecycle: "implicit",
    });

    const installedRowToClassified = <
      TDeclared extends {
        readonly entry: { readonly source: string; readonly enabled?: boolean };
      },
      TPackMember,
    >(
      type: WorkspaceManagedExtensionType,
      row: {
        readonly key: { readonly name: ExtensionName };
        readonly installationOrigin:
          | { readonly _tag: "direct"; readonly declared: TDeclared }
          | { readonly _tag: "pack-member"; readonly member: TPackMember };
        readonly activation: "enabled" | "disabled";
        readonly resolved: Option.Option<{ readonly lockEntry: { readonly type: string } }>;
      },
    ): ClassifiedExtension => {
      if (row.installationOrigin._tag === "direct") {
        const source = row.installationOrigin.declared.entry.source;
        return {
          type,
          name: row.key.name,
          source,
          enabled: row.activation === "enabled",
          packagingKind: packagingKindForResolved(row.resolved, type, source),
          lifecycle: "configured",
        };
      }

      return {
        type,
        name: row.key.name,
        source: Option.none(),
        enabled: true,
        packagingKind: "native",
        lifecycle: "implicit",
      };
    };

    const unmanagedRowToClassified = (
      type: WorkspaceManagedExtensionType,
      row: {
        readonly key: { readonly name: ExtensionName };
        readonly actual: { readonly contentRoot?: string | null };
      },
    ): ClassifiedExtension => ({
      type,
      name: row.key.name,
      source: Option.none(),
      enabled: true,
      packagingKind: type === "pack" ? "native" : "non-native",
      locations:
        typeof row.actual.contentRoot === "string"
          ? [path.relative(baseDir, row.actual.contentRoot)]
          : [],
      lifecycle: "unmanaged",
    });

    type ResolvedClassifiableRow = {
      readonly name: string;
      readonly keyName?: string;
      readonly lockEntry: { readonly type: string };
    };

    type UnmanagedClassifiableRow = {
      readonly key: { readonly name: ExtensionName };
      readonly actual: { readonly contentRoot?: string | null };
    };

    const collectClassifiedRows = <
      TDeclared extends {
        readonly entry: { readonly source: string; readonly enabled?: boolean };
      },
      TPackMember,
    >(args: {
      readonly type: WorkspaceManagedExtensionType;
      readonly installed: ReadonlyArray<{
        readonly key: { readonly name: ExtensionName };
        readonly installationOrigin:
          | { readonly _tag: "direct"; readonly declared: TDeclared }
          | { readonly _tag: "pack-member"; readonly member: TPackMember };
        readonly activation: "enabled" | "disabled";
        readonly resolved: Option.Option<{ readonly lockEntry: { readonly type: string } }>;
      }>;
      readonly resolved: Option.Option<ReadonlyArray<ResolvedClassifiableRow>>;
      readonly unmanaged: ReadonlyArray<UnmanagedClassifiableRow>;
      readonly ignored: ReadonlyArray<string>;
      readonly packMemberNames?: ReadonlyArray<ExtensionName>;
    }): ReadonlyArray<ClassifiedExtension> => {
      const claimed = new Set<string>(args.installed.map((row) => row.key.name));
      const directImplicit = Option.getOrElse(args.resolved, () => [])
        .filter((row) => !claimed.has(row.name))
        .map((row) => ({ ...row, name: row.keyName ?? row.name }))
        .filter((row) => !claimed.has(row.name) && !isIgnoredName(args.ignored, row.name))
        .flatMap((row) => Option.getOrElse(resolvedRowToImplicit(args.type, row), () => []));
      const packImplicit = (args.packMemberNames ?? [])
        .filter((name) => !claimed.has(name) && !isIgnoredName(args.ignored, name))
        .map((name) => packMemberToImplicit(args.type, name));

      return [
        ...args.installed.map((row) => installedRowToClassified(args.type, row)),
        ...directImplicit,
        ...packImplicit,
        ...args.unmanaged
          .filter((row) => !isIgnoredName(args.ignored, row.key.name))
          .map((row) => unmanagedRowToClassified(args.type, row)),
      ];
    };

    const readScopedContext = <A>(
      f: (
        scoped: ScopedWorkspaceContext,
      ) => Effect.Effect<A, SettingsReadError | LockfileReadError>,
    ): Effect.Effect<A, AppError> =>
      Effect.gen(function* () {
        const context = yield* WorkspaceContext;
        return yield* f(context.scope(scopeForDir(workspaceDir)));
      }).pipe(Effect.provide(contextLayer), Effect.mapError(contextCellErrorToAppError));

    const getClassifiedExtensions = (type: WorkspaceManagedExtensionType) =>
      readScopedContext((scoped) =>
        Effect.gen(function* () {
          switch (type) {
            case "skill": {
              const settings = yield* scoped.state.settings;
              const installed = yield* scoped.skills.installed;
              const resolved = yield* scoped.skills.resolved;
              const unmanaged = yield* scoped.skills.unmanaged;
              const ignored =
                Option.getOrElse(settings, () => createDefaultSettings()).ignored?.skills ?? [];
              return collectClassifiedRows({ type, installed, resolved, unmanaged, ignored });
            }
            case "command": {
              const settings = yield* scoped.state.settings;
              const installed = yield* scoped.commands.installed;
              const resolved = yield* scoped.commands.resolved;
              const packs = yield* scoped.packs.resolved;
              const unmanaged = yield* scoped.commands.unmanaged;
              const ignored =
                Option.getOrElse(settings, () => createDefaultSettings()).ignored?.commands ?? [];
              return collectClassifiedRows({
                type,
                installed,
                resolved,
                unmanaged,
                ignored,
                packMemberNames: packMemberNames(
                  Option.getOrElse(packs, () => []),
                  "resolvedCommands",
                ),
              });
            }
            case "mcp-server": {
              const settings = yield* scoped.state.settings;
              const installed = yield* scoped.mcpServers.installed;
              const resolved = yield* scoped.mcpServers.resolved;
              const unmanaged = yield* scoped.mcpServers.unmanaged;
              const ignored =
                Option.getOrElse(settings, () => createDefaultSettings()).ignored?.mcpServers ?? [];
              return collectClassifiedRows({ type, installed, resolved, unmanaged, ignored });
            }
            case "pack": {
              const settings = yield* scoped.state.settings;
              const installed = yield* scoped.packs.installed;
              const resolved = yield* scoped.packs.resolved;
              const unmanaged = yield* scoped.packs.unmanaged;
              const ignored =
                Option.getOrElse(settings, () => createDefaultSettings()).ignored?.packs ?? [];
              return collectClassifiedRows({ type, installed, resolved, unmanaged, ignored });
            }
            case "subagent": {
              const settings = yield* scoped.state.settings;
              const installed = yield* scoped.subagents.installed;
              const resolved = yield* scoped.subagents.resolved;
              const packs = yield* scoped.packs.resolved;
              const unmanaged = yield* scoped.subagents.unmanaged;
              const ignored =
                Option.getOrElse(settings, () => createDefaultSettings()).ignored?.subagents ?? [];
              return collectClassifiedRows({
                type,
                installed,
                resolved,
                unmanaged,
                ignored,
                packMemberNames: packMemberNames(
                  Option.getOrElse(packs, () => []),
                  "resolvedSubagents",
                ),
              });
            }
          }
        }),
      );

    /**
     * Resolve the immutable registry name for a skill's directory.
     *
     * Registry skill directories are tied to the registry name, not the
     * user-facing alias. This helper tries the lockfile first, then falls
     * back to parsing the settings source string, and finally returns the
     * passed-in name (correct for fresh installs).
     */
    const resolveRegistryDirName = (name: string) =>
      Effect.gen(function* () {
        // Try lockfile
        const lockEntry = yield* readLockfileSafe(workspaceDir).pipe(
          Effect.map((lf) => Option.fromUndefinedOr(lf.skills[name])),
        );
        if (Option.isSome(lockEntry) && lockEntry.value.type === "registry") {
          return lockEntry.value.name;
        }

        // Fallback to settings source string
        const settings = yield* readSettingsSafe(workspaceDir);
        const skills = settings.skills ?? {};
        const entry = skills[name];
        if (entry !== undefined) {
          const sourceStr = entry.source;
          if (sourceStr?.startsWith("registry:")) {
            const parsed = parseRegistrySourcePatternParts(sourceStr.slice("registry:".length));
            if (parsed?.name !== undefined) {
              return parsed.name;
            }
          }
        }

        // Final fallback: passed-in name (correct for fresh installs)
        return name;
      });

    /**
     * Three-layer merge: project sources -> user-scope sources -> built-in sources.
     * Name-based deduplication: earlier layers win.
     */
    const getConfiguredSources = (): Effect.Effect<ReadonlyArray<SourceHostConfig>, AppError> =>
      Effect.gen(function* () {
        if (cachedSources !== null) return cachedSources;

        const projectSettings = yield* readSettingsSafe(localDir);
        const globalSettings = yield* readSettingsSafe(globalDir);

        const projectSources: ReadonlyArray<SourceHostConfig> = projectSettings.sources ?? [];
        const globalSources: ReadonlyArray<SourceHostConfig> = globalSettings.sources ?? [];

        const projectNames = new Set(projectSources.map((s) => s.name));
        const filteredGlobal = globalSources.filter((s) => !projectNames.has(s.name));
        const projectGlobalNames = new Set([...projectNames, ...filteredGlobal.map((s) => s.name)]);

        const merged: ReadonlyArray<SourceHostConfig> = [
          ...projectSources,
          ...filteredGlobal,
          ...builtInSources.filter((s) => !projectGlobalNames.has(s.name)),
        ];

        cachedSources = merged;
        return merged;
      }).pipe(Effect.withSpan("Workspace.getConfiguredSources"));

    return {
      scope: options.scope,
      path: workspaceDir,
      baseDir,

      getLockfileState,

      getConfiguredSources,

      getConfiguredSourceByName: (name: string) =>
        getConfiguredSources().pipe(
          Effect.map((sources) => Option.fromUndefinedOr(sources.find((s) => s.name === name))),
        ),

      getRegistrySourceHosts: () =>
        getConfiguredSources().pipe(
          Effect.map((sources) => {
            const registrySources = sources.filter(
              (s): s is Extract<SourceHostConfig, { type: "registry" }> => s.type === "registry",
            );
            return registrySources;
          }),
        ),

      getConfiguredProfile: () =>
        Effect.gen(function* () {
          const projectSettings = yield* readSettingsSafe(localDir);
          if (projectSettings.profile) return projectSettings.profile;
          const globalSettings = yield* readSettingsSafe(globalDir);
          if (globalSettings.profile) return globalSettings.profile;
          return DEFAULT_PROFILE;
        }),

      // TODO: check logged-in identity handle when auth is implemented
      getDefaultProfile: () =>
        Effect.gen(function* () {
          const projectSettings = yield* readSettingsSafe(localDir);
          if (projectSettings.profile) return Option.some(projectSettings.profile);
          const globalSettings = yield* readSettingsSafe(globalDir);
          if (globalSettings.profile) return Option.some(globalSettings.profile);
          return Option.none<Handle>();
        }),

      addConfiguredSource: (source: SourceHostConfig) =>
        withMutex(
          Effect.gen(function* () {
            const current = yield* readSettingsSafe(workspaceDir);
            const currentSources: ReadonlyArray<SourceHostConfig> = current.sources ?? [];
            const updatedSettings = { ...current, sources: [...currentSources, source] };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
            cachedSources = null; // invalidate cache
          }),
        ).pipe(Effect.withSpan("Workspace.addConfiguredSource")),

      getConfiguredSkills: () =>
        getClassifiedExtensions("skill").pipe(Effect.map(toConfiguredSkillRecord)),

      getImplicitSkills: () =>
        getClassifiedExtensions("skill").pipe(Effect.map(toImplicitSkillRecord)),

      getUnmanagedSkills: () =>
        getClassifiedExtensions("skill").pipe(Effect.map(toUnmanagedSkillRecord)),

      getInstalledSkills: () =>
        getClassifiedExtensions("skill").pipe(Effect.map(toInstalledSkillRecord)),

      getClassifiedSkills: () =>
        getClassifiedExtensions("skill").pipe(Effect.map(toClassifiedSkillRecord)),

      getConfiguredExternalSkills: () =>
        getClassifiedExtensions("skill").pipe(Effect.map(toConfiguredExternalSkillRecord)),

      getUnmanagedExternalSkills: () =>
        getClassifiedExtensions("skill").pipe(Effect.map(toUnmanagedExternalSkillRecord)),

      getIgnoredSkillPatterns: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s): ReadonlyArray<string> => s.ignored?.skills ?? []),
        ),

      getConfiguredAgents: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s) => s.agents ?? []),
          Effect.withSpan("Workspace.getConfiguredAgents"),
        ),

      getLockedSkills: () => readLockfileSafe(workspaceDir).pipe(Effect.map((lf) => lf.skills)),

      getLockedSkill: (name: string) =>
        readLockfileSafe(workspaceDir).pipe(
          Effect.map((lf) => Option.fromUndefinedOr(lf.skills[name])),
        ),

      getSkillDir: (name: string, source?: SkillPathSource) =>
        Effect.gen(function* () {
          if (source !== undefined) {
            const dirName =
              source.refType === "registry" ? yield* resolveRegistryDirName(name) : name;
            return computeSkillPaths(path.join, baseDir, source, sanitizeName(dirName));
          }

          const lockEntry = yield* readLockfileSafe(workspaceDir).pipe(
            Effect.map((lf) => Option.fromUndefinedOr(lf.skills[name])),
          );

          if (Option.isNone(lockEntry)) {
            return yield* makeAppError({
              code: "SKILL_NOT_LOCKED",
              what: `Skill "${name}" not found in lockfile`,
              howToFix: "Install the skill first with `axm skills install`",
            });
          }

          const entry = lockEntry.value;
          const entrySource: SkillPathSource =
            entry.type === "registry"
              ? { refType: "registry", owner: entry.owner }
              : entry.type === "local"
                ? { refType: "local" }
                : { refType: "git-hosted" };

          const dirName = entry.type === "registry" ? entry.name : name;
          return computeSkillPaths(path.join, baseDir, entrySource, sanitizeName(dirName));
        }),

      setSkill: ({ name, lockEntry, versionConstraint }: SetSkillArgs) =>
        withMutex(
          Effect.gen(function* () {
            // Update settings — thread version constraint through so it survives the round-trip
            const sourceInput = lockEntryToSourceParams(lockEntry);
            const source =
              lockEntry.type === "registry"
                ? (() => {
                    const fqn = formatFqn({
                      owner: lockEntry.owner,
                      type: "skill",
                      name: decodeExtensionNameSync(name),
                    });
                    return Option.isSome(versionConstraint)
                      ? `${fqn}@${versionConstraint.value}`
                      : fqn;
                  })()
                : printSourceParams(sourceInput);
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentSkills: SkillsMap = currentSettings.skills ?? {};
            const updatedSettings = {
              ...currentSettings,
              skills: { ...currentSkills, [name]: { source, enabled: true } },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));

            // Update lockfile
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const updatedLockfile = {
              ...currentLockfile,
              skills: {
                ...currentLockfile.skills,
                [name]: {
                  ...lockEntry,
                  updatedAt: new Date(),
                },
              },
            };
            yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("Workspace.setSkill")),

      setSkillLock: ({ name, lockEntry }: SetSkillArgs) =>
        withMutex(
          Effect.gen(function* () {
            // Update lockfile only (skip settings) — used for pack dependencies
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const updatedLockfile = {
              ...currentLockfile,
              skills: {
                ...currentLockfile.skills,
                [name]: {
                  ...lockEntry,
                  updatedAt: new Date(),
                },
              },
            };
            yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("Workspace.setSkillLock")),

      removeSkill: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            // Update settings
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentSkills: SkillsMap = currentSettings.skills ?? {};
            const hasSettingsEntry = name in currentSkills;

            if (hasSettingsEntry) {
              const { [name]: _, ...remainingSkills } = currentSkills;
              void _;
              const updatedSettings = { ...currentSettings, skills: remainingSkills };
              yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
            }

            // Update lockfile
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const hasLockfileEntry = name in currentLockfile.skills;
            if (hasLockfileEntry) {
              const { [name]: __, ...remainingLockSkills } = currentLockfile.skills;
              void __;
              const updatedLockfile = { ...currentLockfile, skills: remainingLockSkills };
              yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
            }
          }),
        ).pipe(Effect.withSpan("Workspace.removeSkill")),

      removeSkillFromSettings: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentSkills: SkillsMap = currentSettings.skills ?? {};
            if (!(name in currentSkills)) return; // no-op

            const { [name]: _, ...remainingSkills } = currentSkills;
            void _;
            const updatedSettings = { ...currentSettings, skills: remainingSkills };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ),

      updateSkillEntry: (name: string, updater: (entry: SkillEntry) => SkillEntry) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentSkills: SkillsMap = currentSettings.skills ?? {};
            const currentEntry = yield* getEntryOrFail(
              currentSkills,
              name,
              "SKILL_NOT_FOUND",
              `Skill "${name}" not found in settings`,
            );
            const updated = updater(currentEntry);
            const updatedSettings = {
              ...currentSettings,
              skills: { ...currentSkills, [name]: updated },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ),

      setSkillEntry: (name: string, entry: SkillEntry) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentSkills: SkillsMap = currentSettings.skills ?? {};
            const updatedSettings = {
              ...currentSettings,
              skills: { ...currentSkills, [name]: entry },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ),

      renameSkill: (oldName: string, newName: string) =>
        withMutex(
          Effect.gen(function* () {
            // Read and validate settings
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentSkills: SkillsMap = currentSettings.skills ?? {};
            const oldEntry = yield* getEntryOrFail(
              currentSkills,
              oldName,
              "SKILL_NOT_FOUND",
              `Skill "${oldName}" not found in settings`,
            );
            const { [oldName]: _, ...remainingSkills } = currentSkills;
            void _;
            const updatedSettings = {
              ...currentSettings,
              skills: { ...remainingSkills, [newName]: oldEntry },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));

            // Rename in lockfile if entry exists
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const oldLockEntry = currentLockfile.skills[oldName];
            if (oldLockEntry !== undefined) {
              const { [oldName]: __, ...remainingLockSkills } = currentLockfile.skills;
              void __;
              const updatedLockfile = {
                ...currentLockfile,
                skills: { ...remainingLockSkills, [newName]: oldLockEntry },
              };
              yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
            }
          }),
        ),

      updateLockEntryAgents: (name: string, agents: ReadonlyArray<string>) =>
        withMutex(
          Effect.gen(function* () {
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const oldEntry = yield* getEntryOrFail(
              currentLockfile.skills,
              name,
              "LOCK_ENTRY_NOT_FOUND",
              `Lock entry "${name}" not found in lockfile`,
            );
            const updatedLockfile = {
              ...currentLockfile,
              skills: {
                ...currentLockfile.skills,
                [name]: { ...oldEntry, agents: [...agents] },
              },
            };
            yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
          }),
        ),

      addConfiguredAgent: (agentId: string) =>
        withMutex(
          Effect.gen(function* () {
            const validId = yield* Schema.decodeUnknownEffect(AgentIdSchema)(agentId).pipe(
              Effect.mapError((error) =>
                makeAppError({
                  code: "SETTINGS_PARSE_FAILED",
                  what: `Invalid agent ID: ${agentId}`,
                  cause: error,
                }),
              ),
            );
            const current = yield* readSettingsSafe(workspaceDir);
            const agents = current.agents ?? [];
            if (agents.includes(validId)) return;
            const updatedSettings: Settings = { ...current, agents: [...agents, validId] };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ),

      // -----------------------------------------------------------------------
      // Command taxonomy getters
      // -----------------------------------------------------------------------

      getConfiguredCommands: () =>
        getClassifiedExtensions("command").pipe(Effect.map(toConfiguredCommandRecord)),

      getImplicitCommands: () =>
        getClassifiedExtensions("command").pipe(Effect.map(toImplicitCommandRecord)),

      getUnmanagedCommands: () =>
        getClassifiedExtensions("command").pipe(Effect.map(toUnmanagedCommandRecord)),

      getInstalledCommands: () =>
        getClassifiedExtensions("command").pipe(Effect.map(toInstalledCommandRecord)),

      getClassifiedCommands: () =>
        getClassifiedExtensions("command").pipe(Effect.map(toClassifiedCommandRecord)),

      getConfiguredExternalCommands: () =>
        getClassifiedExtensions("command").pipe(Effect.map(toConfiguredExternalCommandRecord)),

      getUnmanagedExternalCommands: () =>
        getClassifiedExtensions("command").pipe(Effect.map(toUnmanagedExternalCommandRecord)),

      getIgnoredCommandPatterns: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s): ReadonlyArray<string> => s.ignored?.commands ?? []),
        ),

      // -----------------------------------------------------------------------
      // MCP Server taxonomy getters
      // -----------------------------------------------------------------------

      getConfiguredMcpServers: () =>
        getClassifiedExtensions("mcp-server").pipe(Effect.map(toConfiguredExtensionRefRecord)),

      getImplicitMcpServers: () =>
        getClassifiedExtensions("mcp-server").pipe(Effect.map(toImplicitExtensionRefRecord)),

      getUnmanagedMcpServers: () =>
        getClassifiedExtensions("mcp-server").pipe(Effect.map(toUnmanagedExtensionRefRecord)),

      getInstalledMcpServers: () =>
        getClassifiedExtensions("mcp-server").pipe(Effect.map(toInstalledExtensionRefRecord)),

      getClassifiedMcpServers: () =>
        getClassifiedExtensions("mcp-server").pipe(Effect.map(toClassifiedExtensionRefRecord)),

      getConfiguredExternalMcpServers: () =>
        getClassifiedExtensions("mcp-server").pipe(
          Effect.map(toConfiguredExternalExtensionRefRecord),
        ),

      getUnmanagedExternalMcpServers: () =>
        getClassifiedExtensions("mcp-server").pipe(
          Effect.map(toUnmanagedExternalExtensionRefRecord),
        ),

      getIgnoredMcpServerPatterns: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s): ReadonlyArray<string> => s.ignored?.mcpServers ?? []),
        ),

      // -----------------------------------------------------------------------
      // Pack taxonomy getters
      // -----------------------------------------------------------------------

      getConfiguredPacks: () =>
        getClassifiedExtensions("pack").pipe(Effect.map(toConfiguredExtensionRefRecord)),

      getImplicitPacks: () =>
        getClassifiedExtensions("pack").pipe(Effect.map(toImplicitExtensionRefRecord)),

      getUnmanagedPacks: () =>
        getClassifiedExtensions("pack").pipe(Effect.map(toUnmanagedExtensionRefRecord)),

      getInstalledPacks: () =>
        getClassifiedExtensions("pack").pipe(Effect.map(toInstalledExtensionRefRecord)),

      getClassifiedPacks: () =>
        getClassifiedExtensions("pack").pipe(Effect.map(toClassifiedExtensionRefRecord)),

      getConfiguredExternalPacks: () =>
        getClassifiedExtensions("pack").pipe(Effect.map(toConfiguredExternalExtensionRefRecord)),

      getUnmanagedExternalPacks: () =>
        getClassifiedExtensions("pack").pipe(Effect.map(toUnmanagedExternalExtensionRefRecord)),

      getIgnoredPackPatterns: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s): ReadonlyArray<string> => s.ignored?.packs ?? []),
        ),

      getLockedExtensionPacks: () =>
        readLockfileSafe(workspaceDir).pipe(Effect.map((lf) => lf.packs ?? {})),

      getLockedExtensionPack: (name: string) =>
        readLockfileSafe(workspaceDir).pipe(
          Effect.map((lf) => Option.fromUndefinedOr((lf.packs ?? {})[name])),
        ),

      setExtensionPack: (args: SetExtensionPackArgs) =>
        withMutex(
          Effect.gen(function* () {
            const { name, versionConstraint, ...lockFields } = args;
            const lockEntry: RegistryExtensionPackLockEntry = makeRegistryExtensionPackLockEntry({
              ...lockFields,
              name,
            });
            // Update settings — thread versionConstraint through so it's preserved
            const fqn = formatFqn({
              owner: args.owner,
              type: "pack",
              name: decodeExtensionNameSync(name),
            });
            const source = Option.isSome(versionConstraint)
              ? `${fqn}@${versionConstraint.value}`
              : fqn;
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentPacks: ExtensionPacksMap = currentSettings.packs ?? {};
            const updatedSettings = {
              ...currentSettings,
              packs: { ...currentPacks, [name]: { source } },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));

            // Update lockfile
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedPacks = currentLockfile.packs ?? {};
            const updatedLockfile = {
              ...currentLockfile,
              packs: {
                ...currentLockedPacks,
                [name]: {
                  ...lockEntry,
                  updatedAt: new Date(),
                },
              },
            };
            yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("Workspace.setExtensionPack")),

      removeExtensionPack: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            // Update settings
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentPacks: ExtensionPacksMap = currentSettings.packs ?? {};
            if (!(name in currentPacks)) return; // no-op

            const { [name]: _, ...remainingPacks } = currentPacks;
            void _;
            const updatedSettings = { ...currentSettings, packs: remainingPacks };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));

            // Update lockfile
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedPacks = currentLockfile.packs ?? {};
            if (name in currentLockedPacks) {
              const { [name]: __, ...remainingLockedPacks } = currentLockedPacks;
              void __;
              const updatedLockfile = { ...currentLockfile, packs: remainingLockedPacks };
              yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
            }
          }),
        ).pipe(Effect.withSpan("Workspace.removeExtensionPack")),

      getExtensionPackDir: (name: string, owner: Handle) =>
        Effect.succeed(computeExtensionPackPaths(path.join, baseDir, owner, name)),

      // -----------------------------------------------------------------------
      // Command methods
      // -----------------------------------------------------------------------

      getLockedCommands: () =>
        readLockfileSafe(workspaceDir).pipe(Effect.map((lf) => lf.commands ?? {})),

      getLockedCommand: (name: string) =>
        readLockfileSafe(workspaceDir).pipe(
          Effect.map((lf) => Option.fromUndefinedOr((lf.commands ?? {})[name])),
        ),

      setCommand: ({ name, lockEntry }: SetCommandArgs) =>
        withMutex(
          Effect.gen(function* () {
            // Update settings
            const sourceInput = lockEntryToSourceParams(lockEntry);
            const source = printSourceParams(sourceInput);
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentCommands: CommandsMap = currentSettings.commands ?? {};
            const updatedSettings = {
              ...currentSettings,
              commands: { ...currentCommands, [name]: { source, enabled: true } },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));

            // Update lockfile
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedCommands = currentLockfile.commands ?? {};
            const updatedLockfile = {
              ...currentLockfile,
              commands: {
                ...currentLockedCommands,
                [name]: {
                  ...lockEntry,
                  updatedAt: new Date(),
                },
              },
            };
            yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("Workspace.setCommand")),

      setCommandLock: ({ name, lockEntry }: SetCommandArgs) =>
        withMutex(
          Effect.gen(function* () {
            // Update lockfile only (skip settings) — used for pack dependencies
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedCommands = currentLockfile.commands ?? {};
            const updatedLockfile = {
              ...currentLockfile,
              commands: {
                ...currentLockedCommands,
                [name]: {
                  ...lockEntry,
                  updatedAt: new Date(),
                },
              },
            };
            yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
          }),
        ),

      removeCommand: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            // Update settings
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentCommands: CommandsMap = currentSettings.commands ?? {};
            const hasSettingsEntry = name in currentCommands;

            if (hasSettingsEntry) {
              const { [name]: _, ...remainingCommands } = currentCommands;
              void _;
              const updatedSettings = { ...currentSettings, commands: remainingCommands };
              yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
            }

            // Update lockfile
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedCommands = currentLockfile.commands ?? {};
            if (name in currentLockedCommands) {
              const { [name]: __, ...remainingLockedCommands } = currentLockedCommands;
              void __;
              const updatedLockfile = {
                ...currentLockfile,
                commands: remainingLockedCommands,
              };
              yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
            }
          }),
        ).pipe(Effect.withSpan("Workspace.removeCommand")),

      updateCommandEntry: (name: string, updater: (entry: CommandEntry) => CommandEntry) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentCommands: CommandsMap = currentSettings.commands ?? {};
            const existingEntry = currentCommands[name];
            if (existingEntry === undefined) return;
            const updated = updater(existingEntry);
            const updatedSettings = {
              ...currentSettings,
              commands: { ...currentCommands, [name]: updated },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("Workspace.updateCommandEntry")),

      setCommandEntry: (name: string, entry: CommandEntry) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentCommands: CommandsMap = currentSettings.commands ?? {};
            const updatedSettings = {
              ...currentSettings,
              commands: { ...currentCommands, [name]: entry },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("Workspace.setCommandEntry")),

      // -----------------------------------------------------------------------
      // Subagent taxonomy
      // -----------------------------------------------------------------------

      getConfiguredSubagents: () =>
        getClassifiedExtensions("subagent").pipe(Effect.map(toConfiguredSubagentRecord)),

      getImplicitSubagents: () =>
        getClassifiedExtensions("subagent").pipe(Effect.map(toImplicitSubagentRecord)),

      getInstalledSubagents: () =>
        getClassifiedExtensions("subagent").pipe(Effect.map(toInstalledSubagentRecord)),

      getClassifiedSubagents: () =>
        getClassifiedExtensions("subagent").pipe(Effect.map(toClassifiedSubagentRecord)),

      // -----------------------------------------------------------------------
      // Subagent methods
      // -----------------------------------------------------------------------

      getLockedSubagents: () =>
        readLockfileSafe(workspaceDir).pipe(Effect.map((lf) => lf.subagents ?? {})),

      getLockedSubagent: (name: string) =>
        readLockfileSafe(workspaceDir).pipe(
          Effect.map((lf) => Option.fromUndefinedOr((lf.subagents ?? {})[name])),
        ),

      setSubagent: ({ name, lockEntry }: SetSubagentArgs) =>
        withMutex(
          Effect.gen(function* () {
            // Update settings
            const sourceInput = lockEntryToSourceParams(lockEntry);
            const source = printSourceParams(sourceInput);
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentSubagents: SubagentsMap = currentSettings.subagents ?? {};
            const updatedSettings = {
              ...currentSettings,
              subagents: { ...currentSubagents, [name]: { source, enabled: true } },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));

            // Update lockfile
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedSubagents = currentLockfile.subagents ?? {};
            const updatedLockfile = {
              ...currentLockfile,
              subagents: {
                ...currentLockedSubagents,
                [name]: {
                  ...lockEntry,
                  updatedAt: new Date(),
                },
              },
            };
            yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("Workspace.setSubagent")),

      setSubagentLock: ({ name, lockEntry }: SetSubagentArgs) =>
        withMutex(
          Effect.gen(function* () {
            // Update lockfile only (skip settings) — used for pack dependencies
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedSubagents = currentLockfile.subagents ?? {};
            const updatedLockfile = {
              ...currentLockfile,
              subagents: {
                ...currentLockedSubagents,
                [name]: {
                  ...lockEntry,
                  updatedAt: new Date(),
                },
              },
            };
            yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
          }),
        ),

      removeSubagent: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            // Update settings
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentSubagents: SubagentsMap = currentSettings.subagents ?? {};
            const hasSettingsEntry = name in currentSubagents;

            if (hasSettingsEntry) {
              const { [name]: _, ...remainingSubagents } = currentSubagents;
              void _;
              const updatedSettings = { ...currentSettings, subagents: remainingSubagents };
              yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
            }

            // Update lockfile
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedSubagents = currentLockfile.subagents ?? {};
            if (name in currentLockedSubagents) {
              const { [name]: __, ...remainingLockedSubagents } = currentLockedSubagents;
              void __;
              const updatedLockfile = {
                ...currentLockfile,
                subagents: remainingLockedSubagents,
              };
              yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
            }
          }),
        ).pipe(Effect.withSpan("Workspace.removeSubagent")),

      updateSubagentEntry: (name: string, updater: (entry: SubagentEntry) => SubagentEntry) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentSubagents: SubagentsMap = currentSettings.subagents ?? {};
            const existingEntry = currentSubagents[name];
            if (existingEntry === undefined) return;
            const updated = updater(existingEntry);
            const updatedSettings = {
              ...currentSettings,
              subagents: { ...currentSubagents, [name]: updated },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("Workspace.updateSubagentEntry")),

      setSubagentEntry: (name: string, entry: SubagentEntry) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentSubagents: SubagentsMap = currentSettings.subagents ?? {};
            const updatedSettings = {
              ...currentSettings,
              subagents: { ...currentSubagents, [name]: entry },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("Workspace.setSubagentEntry")),

      removeSubagentSettings: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentSubagents: SubagentsMap = currentSettings.subagents ?? {};
            if (!(name in currentSubagents)) return; // no-op

            const { [name]: _, ...remainingSubagents } = currentSubagents;
            void _;
            const updatedSettings = { ...currentSettings, subagents: remainingSubagents };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ),

      removeSubagentLock: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedSubagents: SubagentsLockMap = currentLockfile.subagents ?? {};
            if (!(name in currentLockedSubagents)) return;
            const { [name]: _, ...remaining } = currentLockedSubagents;
            void _;
            const updatedLockfile = { ...currentLockfile, subagents: remaining };
            yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("Workspace.removeSubagentLock")),

      // -----------------------------------------------------------------------
      // MCP Server methods
      // -----------------------------------------------------------------------

      getLockedMcpServers: () =>
        readLockfileSafe(workspaceDir).pipe(Effect.map((lf) => lf.mcpServers ?? {})),

      getLockedMcpServer: (name: string) =>
        readLockfileSafe(workspaceDir).pipe(
          Effect.map((lf) => Option.fromUndefinedOr((lf.mcpServers ?? {})[name])),
        ),

      setMcpServer: ({ name, lockEntry }: SetMcpServerArgs) =>
        withMutex(
          Effect.gen(function* () {
            // Update settings (uses "mcpServers" key)
            const sourceInput = lockEntryToSourceParams(lockEntry);
            const source = printSourceParams(sourceInput);
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentMcpServers: McpServersMap = currentSettings.mcpServers ?? {};
            const updatedSettings = {
              ...currentSettings,
              mcpServers: { ...currentMcpServers, [name]: { source } },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));

            // Update lockfile (uses "mcpServers" key)
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedMcpServers = currentLockfile.mcpServers ?? {};
            const updatedLockfile = {
              ...currentLockfile,
              mcpServers: {
                ...currentLockedMcpServers,
                [name]: {
                  ...lockEntry,
                  updatedAt: new Date(),
                },
              },
            };
            yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("Workspace.setMcpServer")),

      setMcpServerLock: ({ name, lockEntry }: SetMcpServerArgs) =>
        withMutex(
          Effect.gen(function* () {
            // Update lockfile only (skip settings) — used for pack dependencies
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedMcpServers = currentLockfile.mcpServers ?? {};
            const updatedLockfile = {
              ...currentLockfile,
              mcpServers: {
                ...currentLockedMcpServers,
                [name]: {
                  ...lockEntry,
                  updatedAt: new Date(),
                },
              },
            };
            yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
          }),
        ),

      removeMcpServer: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            // Update settings (uses "mcpServers" key)
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentMcpServers: McpServersMap = currentSettings.mcpServers ?? {};
            const hasSettingsEntry = name in currentMcpServers;

            if (hasSettingsEntry) {
              const { [name]: _, ...remainingMcpServers } = currentMcpServers;
              void _;
              const updatedSettings = {
                ...currentSettings,
                mcpServers: remainingMcpServers,
              };
              yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
            }

            // Update lockfile (uses "mcpServers" key)
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedMcpServers = currentLockfile.mcpServers ?? {};
            if (name in currentLockedMcpServers) {
              const { [name]: __, ...remainingLockedMcpServers } = currentLockedMcpServers;
              void __;
              const updatedLockfile = {
                ...currentLockfile,
                mcpServers: remainingLockedMcpServers,
              };
              yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
            }
          }),
        ).pipe(Effect.withSpan("Workspace.removeMcpServer")),

      // -----------------------------------------------------------------------
      // Granular removal methods (settings-only or lockfile-only)
      // -----------------------------------------------------------------------

      removeSkillLock: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            if (!(name in currentLockfile.skills)) return;
            const { [name]: _, ...remainingSkills } = currentLockfile.skills;
            void _;
            const updatedLockfile = { ...currentLockfile, skills: remainingSkills };
            yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("Workspace.removeSkillLock")),

      removeCommandSettings: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentCommands: CommandsMap = currentSettings.commands ?? {};
            if (!(name in currentCommands)) return;
            const { [name]: _, ...remainingCommands } = currentCommands;
            void _;
            const updatedSettings = { ...currentSettings, commands: remainingCommands };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ),

      removeCommandLock: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedCommands = currentLockfile.commands ?? {};
            if (!(name in currentLockedCommands)) return;
            const { [name]: _, ...remainingCommands } = currentLockedCommands;
            void _;
            const updatedLockfile = { ...currentLockfile, commands: remainingCommands };
            yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
          }),
        ),

      removeMcpServerSettings: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentMcpServers: McpServersMap = currentSettings.mcpServers ?? {};
            if (!(name in currentMcpServers)) return;
            const { [name]: _, ...remainingMcpServers } = currentMcpServers;
            void _;
            const updatedSettings = { ...currentSettings, mcpServers: remainingMcpServers };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ),

      removeMcpServerLock: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedMcpServers = currentLockfile.mcpServers ?? {};
            if (!(name in currentLockedMcpServers)) return;
            const { [name]: _, ...remainingMcpServers } = currentLockedMcpServers;
            void _;
            const updatedLockfile = { ...currentLockfile, mcpServers: remainingMcpServers };
            yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
          }),
        ),

      removeExtensionPackSettings: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentPacks: ExtensionPacksMap = currentSettings.packs ?? {};
            if (!(name in currentPacks)) return;
            const { [name]: _, ...remainingPacks } = currentPacks;
            void _;
            const updatedSettings = { ...currentSettings, packs: remainingPacks };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ),

      removeExtensionPackLock: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedPacks = currentLockfile.packs ?? {};
            if (!(name in currentLockedPacks)) return;
            const { [name]: _, ...remainingPacks } = currentLockedPacks;
            void _;
            const updatedLockfile = { ...currentLockfile, packs: remainingPacks };
            yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
          }),
        ),

      // -----------------------------------------------------------------------
      // Pack dependency queries
      // -----------------------------------------------------------------------

      isExtensionRequiredByInstalledExtensionPack: (target: ExtensionTarget) =>
        Effect.gen(function* () {
          // Packs don't depend on other packs in this model
          if (target.type === "pack") return false;

          const lockfile = yield* readLockfileSafe(workspaceDir);
          const packs = lockfile.packs ?? {};

          for (const packEntry of Object.values(packs)) {
            const resolvedMap =
              target.type === "skill"
                ? packEntry.resolvedSkills
                : target.type === "command"
                  ? packEntry.resolvedCommands
                  : packEntry.resolvedMcpServers;

            // Check if any FQN key in the resolved map ends with the target name
            for (const fqn of Object.keys(resolvedMap)) {
              const resolvedName = parseFullyQualifiedNameParts(fqn)?.name;
              if (resolvedName === target.name) return true;
            }
          }

          return false;
        }),

      markDependencyRetainedInLockfile: (target: ExtensionTarget) =>
        withMutex(
          Effect.gen(function* () {
            const currentLockfile = yield* readLockfileSafe(workspaceDir);

            switch (target.type) {
              case "skill": {
                const entry = currentLockfile.skills[target.name];
                if (entry === undefined) return;
                const updatedLockfile = {
                  ...currentLockfile,
                  skills: {
                    ...currentLockfile.skills,
                    [target.name]: { ...entry, retainedByPack: true },
                  },
                };
                yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
                break;
              }
              case "command": {
                const commands = currentLockfile.commands ?? {};
                const entry = commands[target.name];
                if (entry === undefined) return;
                const updatedLockfile = {
                  ...currentLockfile,
                  commands: {
                    ...commands,
                    [target.name]: { ...entry, retainedByPack: true },
                  },
                };
                yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
                break;
              }
              case "mcp-server": {
                const mcpServers = currentLockfile.mcpServers ?? {};
                const entry = mcpServers[target.name];
                if (entry === undefined) return;
                const updatedLockfile = {
                  ...currentLockfile,
                  mcpServers: {
                    ...mcpServers,
                    [target.name]: { ...entry, retainedByPack: true },
                  },
                };
                yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
                break;
              }
              case "pack":
                // No retention marking for packs — packs are not dependencies of other packs
                break;
            }
          }),
        ),
    };
  });

/**
 * Create a layer that loads workspace context from disk.
 *
 * The workspace must already be initialized.
 *
 * @param options - Workspace layer options
 * @returns Layer providing WorkspaceContext
 *
 * @experimental This API is unstable and may change without notice.
 */
export const layer = (options: WorkspaceLayerOptions) =>
  Layer.effect(Workspace, loadWorkspace(options));
