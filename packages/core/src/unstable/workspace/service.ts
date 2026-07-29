/**
 * WorkspaceMutations mutation facade implementation.
 *
 * This is the sole public gateway for all settings and lockfile read/write
 * operations. It reads through `WorkspaceReadModel`, writes settings directly,
 * and commits lockfile snapshots through the lockfile module so cross-process
 * updates are serialized and merged per entry. It also serializes in-process
 * mutations via a single Semaphore(1). No other service should perform settings
 * or lockfile I/O in production; the per-service semaphores in
 * `settings/service.ts` and `lockfile/service.ts` have been removed.
 *
 * Supporting logic is split into focused modules:
 * - `source-metadata.ts` — source metadata derivation helpers
 * - `initialization.ts` — workspace initialization (agent detection, settings creation)
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Duration from "effect/Duration";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import {
  LOCKFILE_NAME,
  LOCKFILE_VERSION,
  commitLockfileSnapshotUpdate,
  type FilesLockMap,
  type HooksLockMap,
  type KnowledgeLockMap,
  type PackLockEntry,
  type ResolvedExtensionMap,
  type RulesLockMap,
  type SkillLockEntry,
  type SubagentLockEntry,
  type SubagentsLockMap,
} from "../lockfile/index.js";
import type { Lockfile } from "../lockfile/schema.js";
import { computeSkillPaths } from "../skills/paths.js";
import { computePackPaths } from "../packs/paths.js";
import type { Handle } from "../extensions/handle.js";
import { sanitizeName } from "../extensions/utils.js";
import {
  ConfigurableAgentIdSchema,
  decodeExtensionNameSync,
  formatFqn,
  parseExtensionFqnParts,
  parseRegistrySourcePatternParts,
} from "../extensions/index.js";
import { type AppError, BC, makeAppError } from "../app-error/index.js";
import {
  type CommandEntry,
  type CommandsMap,
  createDefaultSettings,
  type FilesEntry,
  type FilesMap,
  type HookEntry,
  type HooksMap,
  type KnowledgeEntry,
  type KnowledgeMap,
  type InstructionsConfigValue,
  type McpServerEntry,
  type McpServersMap,
  type MinimumReleaseAge,
  type SkillEntry,
  type SubagentEntry,
  type PackEntry,
  type PacksMap,
  type RuleEntry,
  type RulesMap,
  type Settings,
  SETTINGS_FILENAME,
  type SkillsMap,
  type SubagentsMap,
  type SourceHostConfig,
  writeSettings,
} from "../settings/index.js";
import { DEFAULT_MINIMUM_RELEASE_AGE } from "../registry/index.js";
import { lockEntryToSourceParams, printSourceParams } from "../sources/index.js";
import { makeAbsolutePath } from "../utils/path-types.js";

import { withStrictLockfileReads } from "./lockfile-read-tolerance.js";
import { getAxmDir } from "./paths.js";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { AgentRootResolverLive } from "./read-model/agent-root-resolver.js";
import {
  makeWorkspaceReadModel,
  WorkspaceReadModelConfig,
  type WorkspaceReadModel,
} from "./read-model/service.js";
import type {
  LockfileReadError,
  SettingsReadError,
  WorkspaceRootEscape,
} from "./read-model/errors.js";
import {
  WorkspaceMutations,
  type WorkspaceMutationsOptions,
  type SetSkillArgs,
  type SetPackArgs,
  type SetCommandArgs,
  type SetFilesArgs,
  type SetRuleArgs,
  type SetHookArgs,
  type SetKnowledgeArgs,
  type SetMcpServerArgs,
  type SetSubagentArgs,
  type SkillPathSource,
  type ExtensionTarget,
} from "./service-interface.js";
import type { LockfileState } from "./augment-plan.js";
import { makeReadModelRecordReaders } from "./read-model-record-readers.js";
const createEmptyLockfile = (): Lockfile => ({
  lockfileVersion: LOCKFILE_VERSION,
  skills: {},
});

const normalizeForStableCompare = (value: unknown): unknown => {
  if (DateTime.isDateTime(value)) return DateTime.formatIso(value);
  if (Array.isArray(value)) return value.map(normalizeForStableCompare);
  if (typeof value === "object" && value !== null) {
    const normalized: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      normalized[key] = normalizeForStableCompare(entryValue);
    }
    return normalized;
  }
  return value;
};

const stableCompare = (left: unknown, right: unknown): boolean =>
  JSON.stringify(normalizeForStableCompare(left)) ===
  JSON.stringify(normalizeForStableCompare(right));

type TimestampedLockEntry = {
  readonly installedAt: DateTime.Utc;
  readonly updatedAt: DateTime.Utc;
};

const withoutLockTimestamps = (entry: TimestampedLockEntry): unknown => {
  const { installedAt: _installedAt, updatedAt: _updatedAt, ...rest } = entry;
  return rest;
};

const lockEntrySemanticallyEqual = <TEntry extends TimestampedLockEntry>(
  current: TEntry | undefined,
  next: TEntry,
): boolean =>
  current !== undefined &&
  stableCompare(withoutLockTimestamps(current), withoutLockTimestamps(next));

const skillLockEntrySemanticallyEqual = (
  current: SkillLockEntry | undefined,
  next: SkillLockEntry,
): boolean => lockEntrySemanticallyEqual(current, next);

const nextUpdatedAt = (current: TimestampedLockEntry | undefined): Effect.Effect<DateTime.Utc> =>
  Effect.gen(function* () {
    const now = yield* DateTime.now;
    if (current === undefined) return now;
    // Keep updatedAt strictly increasing even when the clock has not advanced
    // between two writes within the same millisecond.
    return DateTime.isGreaterThan(now, current.updatedAt)
      ? now
      : DateTime.addDuration(current.updatedAt, Duration.millis(1));
  });

const preserveLockTimestampsOnNoop = <TEntry extends TimestampedLockEntry>(
  current: TEntry | undefined,
  next: TEntry,
): Effect.Effect<TEntry> =>
  Effect.gen(function* () {
    const candidate = {
      ...next,
      installedAt: current?.installedAt ?? next.installedAt,
      updatedAt: yield* nextUpdatedAt(current),
    };
    return lockEntrySemanticallyEqual(current, candidate) && current !== undefined
      ? current
      : candidate;
  });

const subagentLockEntrySemanticallyEqual = (
  current: SubagentLockEntry | undefined,
  next: SubagentLockEntry,
): boolean => lockEntrySemanticallyEqual(current, next);

const contextReadErrorToAppError = (
  source: "settings" | "lockfile" | "workspace",
  error: SettingsReadError | LockfileReadError | WorkspaceRootEscape,
): AppError => {
  // A hand-edited settings file the user can correct is a validation failure,
  // not an internal error; name the offending keys so the fix is obvious.
  if (error._tag === "SettingsDecodeError") {
    return makeAppError({
      code: "validation",
      detail: `Invalid workspace settings at ${error.path}: ${error.issues.join("; ")}`,
      cause: error,
      suggestions: [
        { description: "Edit the settings file to fix the invalid value, then re-run." },
      ],
    });
  }
  if (error._tag === "SettingsParseError") {
    return makeAppError({
      code: "validation",
      detail: `Workspace settings at ${error.path} are not valid JSON`,
      cause: error,
      suggestions: [{ description: "Fix the JSON syntax in the settings file, then re-run." }],
    });
  }

  const isUnreadableLockfile =
    error._tag === "LockfileParseError" || error._tag === "LockfileDecodeError";
  return makeAppError({
    code: isUnreadableLockfile ? "validation" : "internal",
    detail: `Failed to read workspace ${source}`,
    cause: error,
    // Where an unreadable lockfile is still terminal, point at the command that
    // backs the bad file up and regenerates it.
    ...(isUnreadableLockfile
      ? {
          suggestions: [
            BC.run("axm sync", "Back up the unreadable lockfile and regenerate it from settings."),
          ],
        }
      : {}),
  });
};

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
 * Options for creating workspace mutations.
 */
export type WorkspaceLayerOptions = WorkspaceMutationsOptions;

/**
 * Create workspace mutations effect.
 *
 * Loads an existing workspace from disk.
 *
 * The workspace must already be initialized. Missing or invalid settings fail
 * fast with an `AppError`.
 *
 * @param options - WorkspaceMutations layer options
 * @returns Effect yielding WorkspaceMutationsService
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
              code: "internal",
              detail: `Workspace settings not found: ${settingsPath}`,
              suggestions: [{ description: "Create the workspace.", cmd: "axm setup" }],
            }),
          ),
        onSome: () => Effect.void,
      }),
    ),
  );

/**
 * The pack-membership map a dependency target must be looked up in.
 *
 * A returning switch with no `default`: under `noImplicitReturns`, a missing
 * arm is a compile error rather than a silent fall-through into the wrong map.
 */
const packResolvedMapForTarget = (
  packEntry: PackLockEntry,
  targetType: Exclude<ExtensionTarget["type"], "pack">,
): ResolvedExtensionMap => {
  switch (targetType) {
    case "skill":
      return packEntry.resolvedSkills;
    case "command":
      return packEntry.resolvedCommands;
    case "mcp-server":
      return packEntry.resolvedMcpServers;
    case "subagent":
      return packEntry.resolvedSubagents;
    case "files":
      return packEntry.resolvedFiles ?? {};
    case "rule":
      return packEntry.resolvedRules ?? {};
    case "hook":
      return packEntry.resolvedHooks ?? {};
    case "knowledge":
      return packEntry.resolvedKnowledge ?? {};
  }
};

/**
 * The lockfile with `retainedByPack: true` written onto the target's entry, or
 * `undefined` when there is nothing to mark.
 *
 * A returning switch with no `default`: under `noImplicitReturns`, a missing
 * arm is a compile error instead of a silently unmarked retention.
 */
const lockfileWithRetainedDependency = (
  currentLockfile: Lockfile,
  target: ExtensionTarget,
): Lockfile | undefined => {
  switch (target.type) {
    case "skill": {
      const entry = currentLockfile.skills[target.name];
      if (entry === undefined) return undefined;
      return {
        ...currentLockfile,
        skills: {
          ...currentLockfile.skills,
          [target.name]: { ...entry, retainedByPack: true },
        },
      };
    }
    case "command": {
      const commands = currentLockfile.commands ?? {};
      const entry = commands[target.name];
      if (entry === undefined) return undefined;
      return {
        ...currentLockfile,
        commands: { ...commands, [target.name]: { ...entry, retainedByPack: true } },
      };
    }
    case "mcp-server": {
      const mcpServers = currentLockfile.mcpServers ?? {};
      const entry = mcpServers[target.name];
      if (entry === undefined) return undefined;
      return {
        ...currentLockfile,
        mcpServers: { ...mcpServers, [target.name]: { ...entry, retainedByPack: true } },
      };
    }
    case "subagent": {
      const subagents = currentLockfile.subagents ?? {};
      const entry = subagents[target.name];
      if (entry === undefined) return undefined;
      return {
        ...currentLockfile,
        subagents: { ...subagents, [target.name]: { ...entry, retainedByPack: true } },
      };
    }
    case "files": {
      const files = currentLockfile.files ?? {};
      const entry = files[target.name];
      if (entry === undefined) return undefined;
      return {
        ...currentLockfile,
        files: { ...files, [target.name]: { ...entry, retainedByPack: true } },
      };
    }
    case "rule": {
      const rules = currentLockfile.rules ?? {};
      const entry = rules[target.name];
      if (entry === undefined) return undefined;
      return {
        ...currentLockfile,
        rules: { ...rules, [target.name]: { ...entry, retainedByPack: true } },
      };
    }
    case "hook": {
      const hooks = currentLockfile.hooks ?? {};
      const entry = hooks[target.name];
      if (entry === undefined) return undefined;
      return {
        ...currentLockfile,
        hooks: { ...hooks, [target.name]: { ...entry, retainedByPack: true } },
      };
    }
    case "knowledge": {
      const knowledge = currentLockfile.knowledge ?? {};
      const entry = knowledge[target.name];
      if (entry === undefined) return undefined;
      return {
        ...currentLockfile,
        knowledge: { ...knowledge, [target.name]: { ...entry, retainedByPack: true } },
      };
    }
    case "pack":
      // No retention marking for packs — packs are not dependencies of other packs
      return undefined;
  }
};

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
    const contextEnv = Layer.mergeAll(
      fsLayer,
      Layer.succeed(WorkspaceReadModelConfig, {
        projectRoot: makeAbsolutePath(path, path.dirname(localDir)),
        userHome: makeAbsolutePath(path, path.dirname(globalDir)),
        allowedRoot: makeAbsolutePath(path, "/"),
      }),
      AgentRootResolverLive.pipe(Layer.provide(fsLayer)),
    );

    const scopeForDir = (dir: string): "project" | "user" =>
      dir === globalDir ? "user" : "project";

    const readSettingsCell = (dir: string) =>
      makeWorkspaceReadModel(scopeForDir(dir)).pipe(
        Effect.flatMap((readModel) => readModel.state.settings),
        Effect.provide(contextEnv),
        Effect.mapError((error) => contextReadErrorToAppError("settings", error)),
      );

    const readLockfileCell = (dir: string) =>
      makeWorkspaceReadModel(scopeForDir(dir)).pipe(
        Effect.flatMap((readModel) => readModel.state.lockfile),
        Effect.map(Option.getOrElse(createEmptyLockfile)),
        Effect.provide(contextEnv),
        Effect.mapError((error) => contextReadErrorToAppError("lockfile", error)),
      );

    if (options.allowUninitialized !== true) {
      yield* requireInitializedWorkspace(settingsPath, readSettingsCell(workspaceDir));
    }

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
      message: string,
    ): Effect.Effect<T, AppError> =>
      key in record && record[key] !== undefined
        ? Effect.succeed(record[key])
        : Effect.fail(makeAppError({ code, detail: message }));

    /**
     * Probe lockfile state without mutating disk.
     */
    const getLockfileState = (): Effect.Effect<LockfileState, AppError> =>
      Effect.gen(function* () {
        const lockfilePath = path.join(workspaceDir, LOCKFILE_NAME);
        const exists = yield* fs.exists(lockfilePath).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "validation",
              detail: `Failed to check if lockfile exists at ${lockfilePath}`,
              cause: error,
            }),
          ),
        );

        if (!exists) {
          return "missing";
        }

        // Pinned strict: this probe is what tells reconciliation the difference
        // between "invalid" and "ok", so it must never inherit an ambient
        // degrade policy that would report an unreadable lockfile as absent.
        return yield* withStrictLockfileReads(readLockfileSafe(workspaceDir)).pipe(
          Effect.as("ok" as const),
          Effect.catch((error) => {
            if (error.code === "validation") {
              return Effect.succeed("invalid" as const);
            }

            return Effect.fail(error);
          }),
        );
      }).pipe(Effect.withSpan("WorkspaceMutations.getLockfileState"));

    const readScopedContext = <A>(
      f: (scoped: WorkspaceReadModel) => Effect.Effect<A, SettingsReadError | LockfileReadError>,
    ): Effect.Effect<A, AppError> =>
      makeWorkspaceReadModel(scopeForDir(workspaceDir)).pipe(
        Effect.flatMap(f),
        Effect.provide(contextEnv),
        Effect.mapError(contextCellErrorToAppError),
      );

    const readModelRecordReaders = makeReadModelRecordReaders({ baseDir, path, readScopedContext });
    const records = {
      getExtensionInventory: readModelRecordReaders.getExtensionInventory,
      rows: readModelRecordReaders.getReadModelRecordRows,
    };

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
      }).pipe(Effect.withSpan("WorkspaceMutations.getConfiguredSources"));

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

      records,

      getConfiguredOwner: () =>
        Effect.gen(function* () {
          const projectSettings = yield* readSettingsSafe(localDir);
          if (projectSettings.owner) return Option.some(projectSettings.owner);
          const globalSettings = yield* readSettingsSafe(globalDir);
          if (globalSettings.owner) return Option.some(globalSettings.owner);
          return Option.none<Handle>();
        }),

      getMinimumReleaseAge: Effect.fn("WorkspaceMutations.getMinimumReleaseAge")(function* () {
        const scopedSettings = yield* readSettingsSafe(workspaceDir);
        if (scopedSettings.minimumReleaseAge !== undefined) {
          return scopedSettings.minimumReleaseAge;
        }

        if (options.scope === "project") {
          const globalSettings = yield* readSettingsSafe(globalDir);
          if (globalSettings.minimumReleaseAge !== undefined) {
            return globalSettings.minimumReleaseAge;
          }
        }

        return DEFAULT_MINIMUM_RELEASE_AGE satisfies MinimumReleaseAge;
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
        ).pipe(Effect.withSpan("WorkspaceMutations.addConfiguredSource")),

      getIgnoredSkillPatterns: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s): ReadonlyArray<string> => s.skillsConfig?.ignore ?? []),
        ),

      getConfiguredSkillEntries: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s): SkillsMap => s.skills ?? {}),
          Effect.withSpan("WorkspaceMutations.getConfiguredSkillEntries"),
        ),

      getConfiguredAgents: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s) => s.agents ?? []),
          Effect.withSpan("WorkspaceMutations.getConfiguredAgents"),
        ),

      getInstructionsConfig: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s) => Option.fromUndefinedOr(s.rulesConfig?.instructions)),
          Effect.withSpan("WorkspaceMutations.getInstructionsConfig"),
        ),

      setInstructionsConfig: (config: InstructionsConfigValue) =>
        withMutex(
          Effect.gen(function* () {
            const current = yield* readSettingsSafe(workspaceDir);
            const currentRulesConfig = current.rulesConfig ?? {};
            const updatedSettings: Settings = {
              ...current,
              rulesConfig: { ...currentRulesConfig, instructions: config },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setInstructionsConfig")),

      getConfiguredMcpServerEntries: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s): McpServersMap => s.mcpServers ?? {}),
          Effect.withSpan("WorkspaceMutations.getConfiguredMcpServerEntries"),
        ),

      getConfiguredFilesEntries: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s): FilesMap => s.files ?? {}),
          Effect.withSpan("WorkspaceMutations.getConfiguredFilesEntries"),
        ),

      getWorkspaceVars: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s) => s.vars ?? {}),
          Effect.withSpan("WorkspaceMutations.getWorkspaceVars"),
        ),

      getLockedFiles: () => readLockfileSafe(workspaceDir).pipe(Effect.map((lf) => lf.files ?? {})),

      getLockedFilesEntry: (name: string) =>
        readLockfileSafe(workspaceDir).pipe(
          Effect.map((lf) => Option.fromUndefinedOr((lf.files ?? {})[name])),
        ),

      setFiles: ({ name, lockEntry, versionRange }: SetFilesArgs) =>
        withMutex(
          Effect.gen(function* () {
            const source =
              lockEntry.type === "registry"
                ? (() => {
                    const fqn = formatFqn({
                      owner: lockEntry.owner,
                      type: "files",
                      name: decodeExtensionNameSync(name),
                    });
                    return Option.isSome(versionRange) ? `${fqn}@${versionRange.value}` : fqn;
                  })()
                : printSourceParams(lockEntryToSourceParams(lockEntry));
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentContext: FilesMap = currentSettings.files ?? {};
            const currentEntry = currentContext[name];
            const inputs = currentEntry?.inputs ?? {};
            const updatedSettings = {
              ...currentSettings,
              files: {
                ...currentContext,
                [name]: { source, enabled: true, inputs },
              },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));

            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedContext = currentLockfile.files ?? {};
            const previous = currentLockedContext[name];
            const updatedLockfile = {
              ...currentLockfile,
              files: {
                ...currentLockedContext,
                [name]: yield* preserveLockTimestampsOnNoop(previous, lockEntry),
              },
            };
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setFiles")),

      setFilesLock: ({ name, lockEntry }: SetFilesArgs) =>
        withMutex(
          Effect.gen(function* () {
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedContext = currentLockfile.files ?? {};
            const previous = currentLockedContext[name];
            const updatedLockfile = {
              ...currentLockfile,
              files: {
                ...currentLockedContext,
                [name]: yield* preserveLockTimestampsOnNoop(previous, lockEntry),
              },
            };
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setFilesLock")),

      removeFiles: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentContext: FilesMap = currentSettings.files ?? {};
            const remainingSettings =
              name in currentContext
                ? (() => {
                    const { [name]: _, ...remainingContext } = currentContext;
                    void _;
                    return { ...currentSettings, files: remainingContext };
                  })()
                : currentSettings;

            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedContext = currentLockfile.files ?? {};
            const remainingLockfile =
              name in currentLockedContext
                ? (() => {
                    const { [name]: _, ...remainingContext } = currentLockedContext;
                    void _;
                    return { ...currentLockfile, files: remainingContext };
                  })()
                : currentLockfile;

            yield* writeSettings(workspaceDir, remainingSettings).pipe(Effect.provide(fsLayer));
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              remainingLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.removeFiles")),

      removeFilesSettings: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentContext: FilesMap = currentSettings.files ?? {};
            if (!(name in currentContext)) return;
            const { [name]: _, ...remainingContext } = currentContext;
            void _;
            yield* writeSettings(workspaceDir, {
              ...currentSettings,
              files: remainingContext,
            }).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.removeFilesSettings")),

      removeFilesLock: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedContext: FilesLockMap = currentLockfile.files ?? {};
            if (!(name in currentLockedContext)) return;
            const { [name]: _, ...remainingContext } = currentLockedContext;
            void _;
            const updatedLockfile = {
              ...currentLockfile,
              files: remainingContext,
            };
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.removeFilesLock")),

      updateFilesEntry: (name: string, updater: (entry: FilesEntry) => FilesEntry) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentContext: FilesMap = currentSettings.files ?? {};
            const existingEntry = currentContext[name];
            if (existingEntry === undefined) return;
            yield* writeSettings(workspaceDir, {
              ...currentSettings,
              files: { ...currentContext, [name]: updater(existingEntry) },
            }).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.updateFilesEntry")),

      setFilesEntry: (name: string, entry: FilesEntry) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentContext: FilesMap = currentSettings.files ?? {};
            yield* writeSettings(workspaceDir, {
              ...currentSettings,
              files: { ...currentContext, [name]: entry },
            }).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setFilesEntry")),

      getConfiguredRuleEntries: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s): RulesMap => s.rules ?? {}),
          Effect.withSpan("WorkspaceMutations.getConfiguredRuleEntries"),
        ),

      getLockedRules: () => readLockfileSafe(workspaceDir).pipe(Effect.map((lf) => lf.rules ?? {})),

      getLockedRuleEntry: (name: string) =>
        readLockfileSafe(workspaceDir).pipe(
          Effect.map((lf) => Option.fromUndefinedOr((lf.rules ?? {})[name])),
        ),

      setRule: ({ name, lockEntry, versionRange }: SetRuleArgs) =>
        withMutex(
          Effect.gen(function* () {
            const source =
              lockEntry.type === "registry"
                ? (() => {
                    const fqn = formatFqn({
                      owner: lockEntry.owner,
                      type: "rule",
                      name: decodeExtensionNameSync(name),
                    });
                    return Option.isSome(versionRange) ? `${fqn}@${versionRange.value}` : fqn;
                  })()
                : printSourceParams(lockEntryToSourceParams(lockEntry));
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentRules: RulesMap = currentSettings.rules ?? {};
            yield* writeSettings(workspaceDir, {
              ...currentSettings,
              rules: {
                ...currentRules,
                [name]: { source, enabled: true },
              },
            }).pipe(Effect.provide(fsLayer));

            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedRules = currentLockfile.rules ?? {};
            const previous = currentLockedRules[name];
            const updatedLockfile = {
              ...currentLockfile,
              rules: {
                ...currentLockedRules,
                [name]: yield* preserveLockTimestampsOnNoop(previous, lockEntry),
              },
            };
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setRule")),

      setRuleLock: ({ name, lockEntry }: SetRuleArgs) =>
        withMutex(
          Effect.gen(function* () {
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedRules = currentLockfile.rules ?? {};
            const previous = currentLockedRules[name];
            const updatedLockfile = {
              ...currentLockfile,
              rules: {
                ...currentLockedRules,
                [name]: yield* preserveLockTimestampsOnNoop(previous, lockEntry),
              },
            };
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setRuleLock")),

      removeRule: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentRules: RulesMap = currentSettings.rules ?? {};
            const remainingSettings =
              name in currentRules
                ? (() => {
                    const { [name]: _, ...remainingRules } = currentRules;
                    void _;
                    return { ...currentSettings, rules: remainingRules };
                  })()
                : currentSettings;

            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedRules = currentLockfile.rules ?? {};
            const remainingLockfile =
              name in currentLockedRules
                ? (() => {
                    const { [name]: _, ...remainingRules } = currentLockedRules;
                    void _;
                    return { ...currentLockfile, rules: remainingRules };
                  })()
                : currentLockfile;

            yield* writeSettings(workspaceDir, remainingSettings).pipe(Effect.provide(fsLayer));
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              remainingLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.removeRule")),

      removeRuleSettings: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentRules: RulesMap = currentSettings.rules ?? {};
            if (!(name in currentRules)) return;
            const { [name]: _, ...remainingRules } = currentRules;
            void _;
            yield* writeSettings(workspaceDir, {
              ...currentSettings,
              rules: remainingRules,
            }).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.removeRuleSettings")),

      removeRuleLock: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedRules: RulesLockMap = currentLockfile.rules ?? {};
            if (!(name in currentLockedRules)) return;
            const { [name]: _, ...remainingRules } = currentLockedRules;
            void _;
            const updatedLockfile = {
              ...currentLockfile,
              rules: remainingRules,
            };
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.removeRuleLock")),

      updateRuleEntry: (name: string, updater: (entry: RuleEntry) => RuleEntry) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentRules: RulesMap = currentSettings.rules ?? {};
            const existingEntry = currentRules[name];
            if (existingEntry === undefined) return;
            yield* writeSettings(workspaceDir, {
              ...currentSettings,
              rules: { ...currentRules, [name]: updater(existingEntry) },
            }).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.updateRuleEntry")),

      setRuleEntry: (name: string, entry: RuleEntry) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentRules: RulesMap = currentSettings.rules ?? {};
            yield* writeSettings(workspaceDir, {
              ...currentSettings,
              rules: { ...currentRules, [name]: entry },
            }).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setRuleEntry")),

      getConfiguredHookEntries: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s): HooksMap => s.hooks ?? {}),
          Effect.withSpan("WorkspaceMutations.getConfiguredHookEntries"),
        ),

      getLockedHooks: () => readLockfileSafe(workspaceDir).pipe(Effect.map((lf) => lf.hooks ?? {})),

      getLockedHookEntry: (name: string) =>
        readLockfileSafe(workspaceDir).pipe(
          Effect.map((lf) => Option.fromUndefinedOr((lf.hooks ?? {})[name])),
        ),

      setHook: ({ name, lockEntry, versionRange }: SetHookArgs) =>
        withMutex(
          Effect.gen(function* () {
            const source =
              lockEntry.type === "registry"
                ? (() => {
                    const fqn = formatFqn({
                      owner: lockEntry.owner,
                      type: "hook",
                      name: decodeExtensionNameSync(name),
                    });
                    return Option.isSome(versionRange) ? `${fqn}@${versionRange.value}` : fqn;
                  })()
                : printSourceParams(lockEntryToSourceParams(lockEntry));
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentHooks: HooksMap = currentSettings.hooks ?? {};
            yield* writeSettings(workspaceDir, {
              ...currentSettings,
              hooks: {
                ...currentHooks,
                [name]: { source, enabled: true },
              },
            }).pipe(Effect.provide(fsLayer));

            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedHooks = currentLockfile.hooks ?? {};
            const previous = currentLockedHooks[name];
            const updatedLockfile = {
              ...currentLockfile,
              hooks: {
                ...currentLockedHooks,
                [name]: yield* preserveLockTimestampsOnNoop(previous, lockEntry),
              },
            };
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setHook")),

      setHookLock: ({ name, lockEntry }: SetHookArgs) =>
        withMutex(
          Effect.gen(function* () {
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedHooks = currentLockfile.hooks ?? {};
            const previous = currentLockedHooks[name];
            const updatedLockfile = {
              ...currentLockfile,
              hooks: {
                ...currentLockedHooks,
                [name]: yield* preserveLockTimestampsOnNoop(previous, lockEntry),
              },
            };
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setHookLock")),

      removeHook: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentHooks: HooksMap = currentSettings.hooks ?? {};
            const remainingSettings =
              name in currentHooks
                ? (() => {
                    const { [name]: _, ...remainingHooks } = currentHooks;
                    void _;
                    return { ...currentSettings, hooks: remainingHooks };
                  })()
                : currentSettings;

            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedHooks = currentLockfile.hooks ?? {};
            const remainingLockfile =
              name in currentLockedHooks
                ? (() => {
                    const { [name]: _, ...remainingHooks } = currentLockedHooks;
                    void _;
                    return { ...currentLockfile, hooks: remainingHooks };
                  })()
                : currentLockfile;

            yield* writeSettings(workspaceDir, remainingSettings).pipe(Effect.provide(fsLayer));
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              remainingLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.removeHook")),

      removeHookSettings: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentHooks: HooksMap = currentSettings.hooks ?? {};
            if (!(name in currentHooks)) return;
            const { [name]: _, ...remainingHooks } = currentHooks;
            void _;
            yield* writeSettings(workspaceDir, {
              ...currentSettings,
              hooks: remainingHooks,
            }).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.removeHookSettings")),

      removeHookLock: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedHooks: HooksLockMap = currentLockfile.hooks ?? {};
            if (!(name in currentLockedHooks)) return;
            const { [name]: _, ...remainingHooks } = currentLockedHooks;
            void _;
            const updatedLockfile = {
              ...currentLockfile,
              hooks: remainingHooks,
            };
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.removeHookLock")),

      updateHookEntry: (name: string, updater: (entry: HookEntry) => HookEntry) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentHooks: HooksMap = currentSettings.hooks ?? {};
            const existingEntry = currentHooks[name];
            if (existingEntry === undefined) return;
            yield* writeSettings(workspaceDir, {
              ...currentSettings,
              hooks: { ...currentHooks, [name]: updater(existingEntry) },
            }).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.updateHookEntry")),

      setHookEntry: (name: string, entry: HookEntry) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentHooks: HooksMap = currentSettings.hooks ?? {};
            yield* writeSettings(workspaceDir, {
              ...currentSettings,
              hooks: { ...currentHooks, [name]: entry },
            }).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setHookEntry")),

      getConfiguredKnowledgeEntries: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((settings): KnowledgeMap => settings.knowledge ?? {}),
          Effect.withSpan("WorkspaceMutations.getConfiguredKnowledgeEntries"),
        ),

      getLockedKnowledge: () =>
        readLockfileSafe(workspaceDir).pipe(Effect.map((lockfile) => lockfile.knowledge ?? {})),

      getLockedKnowledgeEntry: (name: string) =>
        readLockfileSafe(workspaceDir).pipe(
          Effect.map((lockfile) => Option.fromUndefinedOr((lockfile.knowledge ?? {})[name])),
        ),

      setKnowledge: ({ name, lockEntry, versionRange }: SetKnowledgeArgs) =>
        withMutex(
          Effect.gen(function* () {
            const source =
              lockEntry.type === "registry"
                ? (() => {
                    const fqn = formatFqn({
                      owner: lockEntry.owner,
                      type: "knowledge",
                      name: decodeExtensionNameSync(name),
                    });
                    return Option.isSome(versionRange) ? `${fqn}@${versionRange.value}` : fqn;
                  })()
                : printSourceParams(lockEntryToSourceParams(lockEntry));
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentKnowledge: KnowledgeMap = currentSettings.knowledge ?? {};
            yield* writeSettings(workspaceDir, {
              ...currentSettings,
              knowledge: { ...currentKnowledge, [name]: { source, enabled: true } },
            }).pipe(Effect.provide(fsLayer));

            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLocked = currentLockfile.knowledge ?? {};
            const previous = currentLocked[name];
            yield* commitLockfileSnapshotUpdate(workspaceDir, currentLockfile, {
              ...currentLockfile,
              knowledge: {
                ...currentLocked,
                [name]: yield* preserveLockTimestampsOnNoop(previous, lockEntry),
              },
            }).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setKnowledge")),

      setKnowledgeLock: ({ name, lockEntry }: SetKnowledgeArgs) =>
        withMutex(
          Effect.gen(function* () {
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLocked = currentLockfile.knowledge ?? {};
            const previous = currentLocked[name];
            yield* commitLockfileSnapshotUpdate(workspaceDir, currentLockfile, {
              ...currentLockfile,
              knowledge: {
                ...currentLocked,
                [name]: yield* preserveLockTimestampsOnNoop(previous, lockEntry),
              },
            }).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setKnowledgeLock")),

      removeKnowledge: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const configured: KnowledgeMap = currentSettings.knowledge ?? {};
            const nextSettings =
              name in configured
                ? (() => {
                    const { [name]: removed, ...remaining } = configured;
                    void removed;
                    return { ...currentSettings, knowledge: remaining };
                  })()
                : currentSettings;
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const locked = currentLockfile.knowledge ?? {};
            const nextLockfile =
              name in locked
                ? (() => {
                    const { [name]: removed, ...remaining } = locked;
                    void removed;
                    return { ...currentLockfile, knowledge: remaining };
                  })()
                : currentLockfile;
            yield* writeSettings(workspaceDir, nextSettings).pipe(Effect.provide(fsLayer));
            yield* commitLockfileSnapshotUpdate(workspaceDir, currentLockfile, nextLockfile).pipe(
              Effect.provide(fsLayer),
            );
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.removeKnowledge")),

      removeKnowledgeSettings: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const configured: KnowledgeMap = currentSettings.knowledge ?? {};
            if (!(name in configured)) return;
            const { [name]: removed, ...remaining } = configured;
            void removed;
            yield* writeSettings(workspaceDir, {
              ...currentSettings,
              knowledge: remaining,
            }).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.removeKnowledgeSettings")),

      removeKnowledgeLock: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const locked: KnowledgeLockMap = currentLockfile.knowledge ?? {};
            if (!(name in locked)) return;
            const { [name]: removed, ...remaining } = locked;
            void removed;
            yield* commitLockfileSnapshotUpdate(workspaceDir, currentLockfile, {
              ...currentLockfile,
              knowledge: remaining,
            }).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.removeKnowledgeLock")),

      updateKnowledgeEntry: (name: string, updater: (entry: KnowledgeEntry) => KnowledgeEntry) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const configured: KnowledgeMap = currentSettings.knowledge ?? {};
            const existing = configured[name];
            if (existing === undefined) return;
            yield* writeSettings(workspaceDir, {
              ...currentSettings,
              knowledge: { ...configured, [name]: updater(existing) },
            }).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.updateKnowledgeEntry")),

      setKnowledgeEntry: (name: string, entry: KnowledgeEntry) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const configured: KnowledgeMap = currentSettings.knowledge ?? {};
            yield* writeSettings(workspaceDir, {
              ...currentSettings,
              knowledge: { ...configured, [name]: entry },
            }).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setKnowledgeEntry")),

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
              code: "conflict",
              detail: `Skill "${name}" not found in lockfile`,
              suggestions: [
                {
                  description: "Install the skill first.",
                  cmd: "axm skills install <source>",
                },
              ],
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

      setSkill: ({ name, lockEntry, versionRange }: SetSkillArgs) =>
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
                    return Option.isSome(versionRange) ? `${fqn}@${versionRange.value}` : fqn;
                  })()
                : printSourceParams(sourceInput);
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentSkills: SkillsMap = currentSettings.skills ?? {};
            const nextSkillEntry: SkillEntry = { source, enabled: true };
            const updatedSettings = {
              ...currentSettings,
              skills: { ...currentSkills, [name]: nextSkillEntry },
            };

            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockEntry = currentLockfile.skills[name];
            const settingsChanged = !stableCompare(currentSkills[name], nextSkillEntry);
            const lockChanged = !skillLockEntrySemanticallyEqual(currentLockEntry, lockEntry);

            if (settingsChanged) {
              yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
            }

            if (!lockChanged) return;

            const updatedLockfile = {
              ...currentLockfile,
              skills: {
                ...currentLockfile.skills,
                [name]: yield* preserveLockTimestampsOnNoop(currentLockEntry, lockEntry),
              },
            };
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setSkill")),

      setSkillLock: ({ name, lockEntry }: SetSkillArgs) =>
        withMutex(
          Effect.gen(function* () {
            // Update lockfile only (skip settings) — used for pack dependencies
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockEntry = currentLockfile.skills[name];
            if (skillLockEntrySemanticallyEqual(currentLockEntry, lockEntry)) {
              return;
            }
            const updatedLockfile = {
              ...currentLockfile,
              skills: {
                ...currentLockfile.skills,
                [name]: yield* preserveLockTimestampsOnNoop(currentLockEntry, lockEntry),
              },
            };
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setSkillLock")),

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
              yield* commitLockfileSnapshotUpdate(
                workspaceDir,
                currentLockfile,
                updatedLockfile,
              ).pipe(Effect.provide(fsLayer));
            }
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.removeSkill")),

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
              "not_found",
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

      addConfiguredAgent: (agentId: string) =>
        withMutex(
          Effect.gen(function* () {
            const validId = yield* Schema.decodeUnknownEffect(ConfigurableAgentIdSchema)(
              agentId,
            ).pipe(
              Effect.mapError((error) =>
                makeAppError({
                  code: "validation",
                  detail: `Invalid agent ID: ${agentId}`,
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

      removeConfiguredAgent: (agentId: string) =>
        withMutex(
          Effect.gen(function* () {
            const validId = yield* Schema.decodeUnknownEffect(ConfigurableAgentIdSchema)(
              agentId,
            ).pipe(
              Effect.mapError((error) =>
                makeAppError({
                  code: "validation",
                  detail: `Invalid agent ID: ${agentId}`,
                  cause: error,
                }),
              ),
            );
            const current = yield* readSettingsSafe(workspaceDir);
            const agents = current.agents ?? [];
            if (!agents.includes(validId)) return;
            const updatedSettings: Settings = {
              ...current,
              agents: agents.filter((configured) => configured !== validId),
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ),

      getIgnoredCommandPatterns: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s): ReadonlyArray<string> => s.commandsConfig?.ignore ?? []),
        ),

      getIgnoredMcpServerPatterns: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s): ReadonlyArray<string> => s.mcpServersConfig?.ignore ?? []),
        ),

      getIgnoredPackPatterns: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s): ReadonlyArray<string> => s.packsConfig?.ignore ?? []),
        ),

      getConfiguredPackEntries: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s): PacksMap => s.packs ?? {}),
          Effect.withSpan("WorkspaceMutations.getConfiguredPackEntries"),
        ),

      getLockedPacks: () => readLockfileSafe(workspaceDir).pipe(Effect.map((lf) => lf.packs ?? {})),

      getLockedPack: (name: string) =>
        readLockfileSafe(workspaceDir).pipe(
          Effect.map((lf) => Option.fromUndefinedOr((lf.packs ?? {})[name])),
        ),

      setPack: (args: SetPackArgs) =>
        withMutex(
          Effect.gen(function* () {
            const { versionRange, ...lockEntry } = args;
            const name = lockEntry.name;
            // Update settings — thread versionRange through so it's preserved
            const fqn = formatFqn({
              owner: args.owner,
              type: "pack",
              name: decodeExtensionNameSync(name),
            });
            const source =
              lockEntry.type === "workspace"
                ? `workspace:${fqn}`
                : Option.isSome(versionRange)
                  ? `${fqn}@${versionRange.value}`
                  : fqn;
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentPacks: PacksMap = currentSettings.packs ?? {};
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
                [name]: yield* preserveLockTimestampsOnNoop(currentLockedPacks[name], lockEntry),
              },
            };
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setPack")),

      setPackEntry: (name: string, entry: PackEntry) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentPacks: PacksMap = currentSettings.packs ?? {};
            const updatedSettings = {
              ...currentSettings,
              packs: { ...currentPacks, [name]: entry },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setPackEntry")),

      removePack: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            // Update settings
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentPacks: PacksMap = currentSettings.packs ?? {};
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
              yield* commitLockfileSnapshotUpdate(
                workspaceDir,
                currentLockfile,
                updatedLockfile,
              ).pipe(Effect.provide(fsLayer));
            }
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.removePack")),

      getPackDir: (name: string, owner: Handle) =>
        Effect.succeed(computePackPaths(path.join, baseDir, owner, name)),

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
            const source =
              lockEntry.type === "registry"
                ? formatFqn({
                    owner: lockEntry.owner,
                    type: "command",
                    name: decodeExtensionNameSync(name),
                  })
                : printSourceParams(lockEntryToSourceParams(lockEntry));
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
                [name]: yield* preserveLockTimestampsOnNoop(currentLockedCommands[name], lockEntry),
              },
            };
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setCommand")),

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
                [name]: yield* preserveLockTimestampsOnNoop(currentLockedCommands[name], lockEntry),
              },
            };
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
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
              yield* commitLockfileSnapshotUpdate(
                workspaceDir,
                currentLockfile,
                updatedLockfile,
              ).pipe(Effect.provide(fsLayer));
            }
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.removeCommand")),

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
        ).pipe(Effect.withSpan("WorkspaceMutations.updateCommandEntry")),

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
        ).pipe(Effect.withSpan("WorkspaceMutations.setCommandEntry")),

      // -----------------------------------------------------------------------
      // Subagent methods
      // -----------------------------------------------------------------------

      getLockedSubagents: () =>
        readLockfileSafe(workspaceDir).pipe(Effect.map((lf) => lf.subagents ?? {})),

      getLockedSubagent: (name: string) =>
        readLockfileSafe(workspaceDir).pipe(
          Effect.map((lf) => Option.fromUndefinedOr((lf.subagents ?? {})[name])),
        ),

      getConfiguredSubagentEntries: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s): SubagentsMap => s.subagents ?? {}),
          Effect.withSpan("WorkspaceMutations.getConfiguredSubagentEntries"),
        ),

      getConfiguredCommandEntries: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s): CommandsMap => s.commands ?? {}),
          Effect.withSpan("WorkspaceMutations.getConfiguredCommandEntries"),
        ),

      setSubagent: ({ name, lockEntry }: SetSubagentArgs) =>
        withMutex(
          Effect.gen(function* () {
            // Update settings
            const source =
              lockEntry.type === "registry"
                ? formatFqn({
                    owner: lockEntry.owner,
                    type: "subagent",
                    name: decodeExtensionNameSync(name),
                  })
                : printSourceParams(lockEntryToSourceParams(lockEntry));
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentSubagents: SubagentsMap = currentSettings.subagents ?? {};
            const nextSubagentEntry: SubagentEntry = { source, enabled: true };
            const updatedSettings = {
              ...currentSettings,
              subagents: { ...currentSubagents, [name]: nextSubagentEntry },
            };

            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedSubagents = currentLockfile.subagents ?? {};
            const currentLockEntry = currentLockedSubagents[name];
            const settingsChanged = !stableCompare(currentSubagents[name], nextSubagentEntry);
            const lockChanged = !subagentLockEntrySemanticallyEqual(currentLockEntry, lockEntry);

            if (settingsChanged) {
              yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
            }

            if (!lockChanged) return;

            const updatedLockfile = {
              ...currentLockfile,
              subagents: {
                ...currentLockedSubagents,
                [name]: yield* preserveLockTimestampsOnNoop(currentLockEntry, lockEntry),
              },
            };
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setSubagent")),

      setSubagentLock: ({ name, lockEntry }: SetSubagentArgs) =>
        withMutex(
          Effect.gen(function* () {
            // Update lockfile only (skip settings) — used for pack dependencies
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedSubagents = currentLockfile.subagents ?? {};
            if (subagentLockEntrySemanticallyEqual(currentLockedSubagents[name], lockEntry)) {
              return;
            }
            const updatedLockfile = {
              ...currentLockfile,
              subagents: {
                ...currentLockedSubagents,
                [name]: yield* preserveLockTimestampsOnNoop(
                  currentLockedSubagents[name],
                  lockEntry,
                ),
              },
            };
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
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
              yield* commitLockfileSnapshotUpdate(
                workspaceDir,
                currentLockfile,
                updatedLockfile,
              ).pipe(Effect.provide(fsLayer));
            }
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.removeSubagent")),

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
        ).pipe(Effect.withSpan("WorkspaceMutations.updateSubagentEntry")),

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
        ).pipe(Effect.withSpan("WorkspaceMutations.setSubagentEntry")),

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
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.removeSubagentLock")),

      // -----------------------------------------------------------------------
      // MCP Server methods
      // -----------------------------------------------------------------------

      getLockedMcpServers: () =>
        readLockfileSafe(workspaceDir).pipe(Effect.map((lf) => lf.mcpServers ?? {})),

      getLockedMcpServer: (name: string) =>
        readLockfileSafe(workspaceDir).pipe(
          Effect.map((lf) => Option.fromUndefinedOr((lf.mcpServers ?? {})[name])),
        ),

      setMcpServer: ({ name, lockEntry, env, enabled }: SetMcpServerArgs) =>
        withMutex(
          Effect.gen(function* () {
            // Update settings (uses "mcpServers" key)
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentMcpServers: McpServersMap = currentSettings.mcpServers ?? {};
            const currentEnabled = currentMcpServers[name]?.enabled ?? true;
            const currentEnv = currentMcpServers[name]?.env ?? {};
            const settingsEntry =
              lockEntry.type === "inline"
                ? {
                    source: "inline",
                    ...(lockEntry.command === undefined ? {} : { command: lockEntry.command }),
                    ...(lockEntry.args === undefined ? {} : { args: lockEntry.args }),
                    ...(lockEntry.url === undefined ? {} : { url: lockEntry.url }),
                    ...(lockEntry.headers === undefined ? {} : { headers: lockEntry.headers }),
                    enabled: enabled ?? currentEnabled,
                    env: env ?? currentEnv,
                  }
                : {
                    source:
                      lockEntry.type === "registry"
                        ? formatFqn({
                            owner: lockEntry.owner,
                            type: "mcp-server",
                            name: decodeExtensionNameSync(name),
                          })
                        : printSourceParams(lockEntryToSourceParams(lockEntry)),
                    enabled: enabled ?? currentEnabled,
                    env: env ?? currentEnv,
                  };
            const updatedSettings = {
              ...currentSettings,
              mcpServers: {
                ...currentMcpServers,
                [name]: settingsEntry,
              },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));

            // Update lockfile (uses "mcpServers" key)
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedMcpServers = currentLockfile.mcpServers ?? {};
            const updatedLockfile = {
              ...currentLockfile,
              mcpServers: {
                ...currentLockedMcpServers,
                [name]: yield* preserveLockTimestampsOnNoop(
                  currentLockedMcpServers[name],
                  lockEntry,
                ),
              },
            };
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setMcpServer")),

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
                [name]: yield* preserveLockTimestampsOnNoop(
                  currentLockedMcpServers[name],
                  lockEntry,
                ),
              },
            };
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ),

      updateMcpServerEntry: (name: string, updater: (entry: McpServerEntry) => McpServerEntry) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentMcpServers: McpServersMap = currentSettings.mcpServers ?? {};
            const currentEntry = yield* getEntryOrFail(
              currentMcpServers,
              name,
              "not_found",
              `MCP server "${name}" not found in settings`,
            );
            const updated = updater(currentEntry);
            const updatedSettings = {
              ...currentSettings,
              mcpServers: { ...currentMcpServers, [name]: updated },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ),

      setMcpServerEntry: (name: string, entry: McpServerEntry) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentMcpServers: McpServersMap = currentSettings.mcpServers ?? {};
            const updatedSettings = {
              ...currentSettings,
              mcpServers: { ...currentMcpServers, [name]: entry },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
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
              yield* commitLockfileSnapshotUpdate(
                workspaceDir,
                currentLockfile,
                updatedLockfile,
              ).pipe(Effect.provide(fsLayer));
            }
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.removeMcpServer")),

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
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.removeSkillLock")),

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
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
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
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ),

      removePackSettings: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentPacks: PacksMap = currentSettings.packs ?? {};
            if (!(name in currentPacks)) return;
            const { [name]: _, ...remainingPacks } = currentPacks;
            void _;
            const updatedSettings = { ...currentSettings, packs: remainingPacks };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ),

      removePackLock: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedPacks = currentLockfile.packs ?? {};
            if (!(name in currentLockedPacks)) return;
            const { [name]: _, ...remainingPacks } = currentLockedPacks;
            void _;
            const updatedLockfile = { ...currentLockfile, packs: remainingPacks };
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ),

      // -----------------------------------------------------------------------
      // Pack dependency queries
      // -----------------------------------------------------------------------

      isExtensionRequiredByInstalledPack: (target: ExtensionTarget) =>
        Effect.gen(function* () {
          // Packs don't depend on other packs in this model
          if (target.type === "pack") return false;

          const lockfile = yield* readLockfileSafe(workspaceDir);
          const packs = lockfile.packs ?? {};

          for (const packEntry of Object.values(packs)) {
            const resolvedMap = packResolvedMapForTarget(packEntry, target.type);

            // Check if any FQN key in the resolved map ends with the target name
            for (const fqn of Object.keys(resolvedMap)) {
              const resolvedName = parseExtensionFqnParts(fqn)?.name;
              if (resolvedName === target.name) return true;
            }
          }

          return false;
        }),

      markDependencyRetainedInLockfile: (target: ExtensionTarget) =>
        withMutex(
          Effect.gen(function* () {
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const updatedLockfile = lockfileWithRetainedDependency(currentLockfile, target);
            if (updatedLockfile === undefined) return;
            yield* commitLockfileSnapshotUpdate(
              workspaceDir,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ),
    };
  });

/**
 * Create a layer that loads workspace read model from disk.
 *
 * The workspace must already be initialized.
 *
 * @param options - WorkspaceMutations layer options
 * @returns Layer providing WorkspaceMutations
 *
 * @experimental This API is unstable and may change without notice.
 */
export const layer = (options: WorkspaceLayerOptions) =>
  Layer.effect(WorkspaceMutations, loadWorkspace(options));
