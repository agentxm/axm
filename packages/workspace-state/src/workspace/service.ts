/**
 * WorkspaceMutations mutation facade implementation.
 *
 * This is the sole public gateway for all settings and lockfile read/write
 * operations. It reads through `WorkspaceReadModel`, writes settings directly,
 * and commits lockfile snapshots through the lockfile module so cross-process
 * updates are serialized and merged per entry. It serializes in-process
 * mutations with one service-owned semaphore and transaction admission with a
 * distinct service-owned semaphore so nested mutation calls cannot deadlock.
 * No other service should perform settings or lockfile I/O in production; the per-service semaphores in
 * `settings/service.ts` and `lockfile/service.ts` have been removed.
 *
 * Supporting logic is split into focused modules:
 * - `source-metadata.ts` — source metadata derivation helpers
 * - `initialization.ts` — workspace initialization (agent detection, settings creation)
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
  LOCKFILE_VERSION,
  commitLockfileSnapshotUpdateAtPath,
  type HooksLockMap,
  type KnowledgeLockMap,
  type RulesLockMap,
  type SkillLockEntry,
  type SubagentLockEntry,
  type SubagentsLockMap,
} from "../lockfile/index.js";
import type { Lockfile } from "../lockfile/schema.js";
import { computeSkillPathsForLayout } from "./skill-paths.js";
import { computePackPathsForLayout } from "./pack-paths.js";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import { sanitizeName } from "./extension-name.js";
import {
  ConfigurableAgentIdSchema,
  decodeExtensionNameSync,
  formatFqn,
  parseSourceQualifiedRegistrySourcePatternParts,
} from "@agentxm/extension-model/unstable/extensions";
import {
  DesiredPackGraphIncomplete,
  InvalidAgentId,
  LockedSkillMissing,
  SettingsEntryMissing,
  WorkspaceNotInitialized,
} from "./errors.js";
import { LockfileVersionUnsupported } from "./read-model/errors.js";
import { LockfileValidationError } from "../lockfile/errors.js";
import {
  createDefaultSettings,
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
  type SkillsMap,
  type SubagentsMap,
  type SourceHostConfig,
  writeSettingsAtPath,
} from "../settings/index.js";
import { DEFAULT_MINIMUM_RELEASE_AGE } from "@agentxm/registry-protocol/unstable/registry/release-age-policy";
import { type ScopedReleaseAgeExcludePattern } from "@agentxm/extension-model/unstable/extensions/release-age";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import { lockEntryToSourceParams } from "./lock-entry-to-source-params.js";
import { makeAbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import { resolveKnowledgeDiscoveryConfig } from "../knowledge/discovery-config.js";

import { getProjectRuntimeDir, resolveUserHome } from "./paths.js";
import {
  resolveProjectWorkspaceLayout,
  resolveProjectWorkspaceStatePaths,
  resolveUserWorkspaceLayout,
} from "./layout.js";
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
  type WorkspaceMutationsOptions,
  type SetSkillArgs,
  type SetPackArgs,
  type SetRuleArgs,
  type SetHookArgs,
  type SetKnowledgeArgs,
  type SetMcpServerArgs,
  type SetSubagentArgs,
  type SkillPathSource,
  type ExtensionTarget,
  type LockfileState,
  type MakeWorkspaceTransactionCapabilities,
  type WorkspaceLockfileReadFailure,
  type WorkspaceSettingsReadFailure,
  type WorkspaceStateReadFailure,
} from "./service-interface.js";
import { makeReadModelRecordReaders } from "./read-model-record-readers.js";
import { buildDesiredStateGraph } from "./desired-state-graph.js";
import { validateDesiredPackLock } from "./desired-pack-lock.js";
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

const lockEntrySemanticallyEqual = <TEntry>(current: TEntry | undefined, next: TEntry): boolean =>
  current !== undefined && stableCompare(current, next);

const skillLockEntrySemanticallyEqual = (
  current: SkillLockEntry | undefined,
  next: SkillLockEntry,
): boolean => lockEntrySemanticallyEqual(current, next);

const preserveAcceptedResolutionOnNoop = <TEntry>(
  current: TEntry | undefined,
  next: TEntry,
): TEntry => (lockEntrySemanticallyEqual(current, next) && current !== undefined ? current : next);

const subagentLockEntrySemanticallyEqual = (
  current: SubagentLockEntry | undefined,
  next: SubagentLockEntry,
): boolean => lockEntrySemanticallyEqual(current, next);

/**
 * Options for creating workspace mutations.
 */
export type WorkspaceLayerOptions = WorkspaceMutationsOptions;

const requireInitializedWorkspace = (
  settingsPath: string,
  settings: Effect.Effect<Option.Option<Settings>, WorkspaceSettingsReadFailure>,
  lockfile: Effect.Effect<Lockfile, WorkspaceLockfileReadFailure>,
) =>
  settings.pipe(
    Effect.flatMap(
      Option.match({
        onNone: () =>
          lockfile.pipe(
            Effect.matchEffect({
              onFailure: (
                error,
              ): Effect.Effect<never, LockfileVersionUnsupported | WorkspaceNotInitialized> =>
                error instanceof LockfileVersionUnsupported &&
                error.observedVersion > error.supportedVersion
                  ? Effect.fail(error)
                  : Effect.fail(new WorkspaceNotInitialized({ settingsPath })),
              onSuccess: (): Effect.Effect<
                never,
                LockfileVersionUnsupported | WorkspaceNotInitialized
              > => Effect.fail(new WorkspaceNotInitialized({ settingsPath })),
            }),
          ),
        onSome: () => Effect.void,
      }),
    ),
  );

/**
 * Create the workspace mutations service from an existing workspace on disk.
 *
 * The workspace must already be initialized. Missing or invalid settings and
 * invalid or unsupported lockfiles fail fast with a typed
 * `WorkspaceMutationsError`. The two operations-side
 * capabilities — the transaction runner and transition acquirer — are
 * injected through `makeCapabilities`; the composition seam in
 * `./operations/load-workspace.ts` supplies the live implementation.
 */
export const makeWorkspaceMutations = (
  options: WorkspaceLayerOptions,
  makeCapabilities: MakeWorkspaceTransactionCapabilities,
) =>
  Effect.gen(function* () {
    const userHome = yield* resolveUserHome();
    const initialUserLayout = yield* resolveUserWorkspaceLayout(userHome);
    const userRuntimeDir = initialUserLayout.runtimeDir;
    const localRuntimeDir = yield* getProjectRuntimeDir(options.projectRoot);
    const workspaceDir = options.scope === "user" ? userRuntimeDir : localRuntimeDir;

    // Capture FileSystem and Path for use in closures
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const semaphore = yield* Semaphore.make(1);
    const initialProjectState = resolveProjectWorkspaceStatePaths(path, options.projectRoot);
    const settingsPath =
      options.scope === "user" ? initialUserLayout.settingsPath : initialProjectState.settingsPath;
    const lockPath =
      options.scope === "user" ? initialUserLayout.lockPath : initialProjectState.lockPath;
    const baseDir = options.scope === "user" ? userHome : options.projectRoot;

    const fsLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );
    const contextEnv = Layer.mergeAll(
      fsLayer,
      Layer.succeed(WorkspaceReadModelConfig, {
        projectRoot: options.projectRoot,
        userHome,
        allowedRoot: makeAbsolutePath(path, "/"),
      }),
      AgentRootResolverLive.pipe(Layer.provide(fsLayer)),
    );

    const scopeForDir = (
      dir: string,
      sharedScope: "project" | "user" = options.scope,
    ): "project" | "user" =>
      dir === userRuntimeDir && dir === localRuntimeDir
        ? sharedScope
        : dir === userRuntimeDir
          ? "user"
          : "project";

    const readSettingsCell = (dir: string, sharedScope?: "project" | "user") =>
      makeWorkspaceReadModel(scopeForDir(dir, sharedScope)).pipe(
        Effect.flatMap((readModel) => readModel.state.settings),
        Effect.provide(contextEnv),
      );

    const readLockfileCell = (dir: string, sharedScope?: "project" | "user") =>
      makeWorkspaceReadModel(scopeForDir(dir, sharedScope)).pipe(
        Effect.flatMap((readModel) => readModel.state.lockfile),
        Effect.map(Option.getOrElse(createEmptyLockfile)),
        Effect.provide(contextEnv),
      );

    if (options.allowUninitialized !== true) {
      yield* requireInitializedWorkspace(
        settingsPath,
        readSettingsCell(workspaceDir),
        readLockfileCell(workspaceDir),
      );
      yield* readLockfileCell(workspaceDir);
    }

    const projectSettings = yield* readSettingsCell(localRuntimeDir, "project").pipe(
      Effect.map(Option.getOrElse(() => createDefaultSettings())),
    );
    const userSettings = yield* readSettingsCell(userRuntimeDir, "user").pipe(
      Effect.map(Option.getOrElse(() => createDefaultSettings())),
    );
    const projectLayout = yield* resolveProjectWorkspaceLayout(
      options.projectRoot,
      projectSettings,
    );
    const userLayout = yield* resolveUserWorkspaceLayout(userHome, userSettings);
    const layout = options.scope === "project" ? projectLayout : userLayout;

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
    const readSettingsSafe = (dir: string, sharedScope?: "project" | "user") =>
      readSettingsCell(dir, sharedScope).pipe(
        Effect.map(Option.getOrElse(() => createDefaultSettings())),
      );

    /**
     * Read lockfile from a directory, returning empty lockfile if not found.
     */
    const readLockfileSafe = (dir: string) => readLockfileCell(dir);

    const writeScopedSettings = (settings: Settings) => writeSettingsAtPath(settingsPath, settings);

    const commitWorkspaceState = (base: Lockfile, next: Lockfile) =>
      commitLockfileSnapshotUpdateAtPath(lockPath, base, next).pipe(Effect.provide(fsLayer));

    const { runTransaction, acquireTransition } = yield* makeCapabilities({
      workspaceDir,
      settingsPath,
      lockPath,
    });

    /**
     * Look up `key` in `record`, failing with `onMissing`'s error when absent.
     */
    const getEntryOrFail = <T, E>(
      record: Readonly<Record<string, T>>,
      key: string,
      onMissing: () => E,
    ): Effect.Effect<T, E> =>
      key in record && record[key] !== undefined
        ? Effect.succeed(record[key])
        : Effect.fail(onMissing());

    /**
     * Probe lockfile state without mutating disk.
     */
    const getLockfileState = (): Effect.Effect<
      LockfileState,
      LockfileValidationError | WorkspaceRootEscape
    > =>
      Effect.gen(function* () {
        const exists = yield* fs
          .exists(lockPath)
          .pipe(
            Effect.mapError(
              (cause) => new LockfileValidationError({ path: lockPath, step: "probe", cause }),
            ),
          );

        if (!exists) {
          return "missing";
        }

        // An unreadable or corrupt lockfile is actionable workspace state,
        // not a violated invariant.
        return yield* readLockfileSafe(workspaceDir).pipe(
          Effect.as("ok" as const),
          Effect.catchTag(
            [
              "LockfileIoError",
              "LockfileParseError",
              "LockfileDecodeError",
              "LockfileVersionUnsupported",
            ],
            () => Effect.succeed("invalid" as const),
          ),
        );
      }).pipe(Effect.withSpan("WorkspaceMutations.getLockfileState"));

    const readScopedContext = <A>(
      f: (scoped: WorkspaceReadModel) => Effect.Effect<A, SettingsReadError | LockfileReadError>,
    ): Effect.Effect<A, WorkspaceStateReadFailure> =>
      makeWorkspaceReadModel(scopeForDir(workspaceDir)).pipe(
        Effect.flatMap(f),
        Effect.provide(contextEnv),
      );

    const readDesiredStateGraph = (graphOptions?: {
      readonly prospectivePacks?: Parameters<typeof buildDesiredStateGraph>[0]["prospectivePacks"];
    }) =>
      Effect.gen(function* () {
        const settings = yield* readSettingsSafe(workspaceDir);
        const configuredSources = yield* getConfiguredSources();
        const registryAuthorities = Object.fromEntries(
          configuredSources.flatMap((source) =>
            source.type === "registry" ? [[source.name, source.location] as const] : [],
          ),
        );
        const graph = yield* buildDesiredStateGraph({
          baseDir,
          settings,
          layout,
          registryAuthorities,
          ...(graphOptions?.prospectivePacks === undefined
            ? {}
            : { prospectivePacks: graphOptions.prospectivePacks }),
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        );
        const lockfile = yield* readLockfileSafe(workspaceDir);
        return yield* validateDesiredPackLock({ graph, lockfile, layout }).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        );
      });
    const readModelRecordReaders = makeReadModelRecordReaders({
      baseDir,
      path,
      readScopedContext,
      getDesiredStateGraph: readDesiredStateGraph,
    });
    const records = {
      getInventory: readModelRecordReaders.getInventory,
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
          const parsed = parseSourceQualifiedRegistrySourcePatternParts(entry.source);
          if (parsed?.name !== undefined) {
            return parsed.name;
          }
        }

        // Final fallback: passed-in name (correct for fresh installs)
        return name;
      });

    /**
     * Three-layer merge: project sources -> user-scope sources -> built-in sources.
     * Name-based deduplication: earlier layers win.
     */
    const getConfiguredSources = (): Effect.Effect<
      ReadonlyArray<SourceHostConfig>,
      WorkspaceSettingsReadFailure
    > =>
      Effect.gen(function* () {
        if (cachedSources !== null) return cachedSources;

        const projectSettings = yield* readSettingsSafe(localRuntimeDir, "project");
        const globalSettings = yield* readSettingsSafe(userRuntimeDir, "user");

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
      layout,

      runTransaction,

      acquireTransition,

      getLockfileState,

      getDesiredStateGraph: (graphOptions?: Parameters<typeof readDesiredStateGraph>[0]) =>
        readDesiredStateGraph(graphOptions).pipe(
          Effect.withSpan("WorkspaceMutations.getDesiredStateGraph"),
        ),

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
          const projectSettings = yield* readSettingsSafe(localRuntimeDir, "project");
          if (projectSettings.owner) return Option.some(projectSettings.owner);
          const globalSettings = yield* readSettingsSafe(userRuntimeDir, "user");
          if (globalSettings.owner) return Option.some(globalSettings.owner);
          return Option.none<Handle>();
        }),

      getPublishDefaultVisibility: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((settings) => Option.fromUndefinedOr(settings.publish?.defaultVisibility)),
        ),

      getMinimumReleaseAge: Effect.fn("WorkspaceMutations.getMinimumReleaseAge")(function* () {
        const scopedSettings = yield* readSettingsSafe(workspaceDir);
        if (scopedSettings.minimumReleaseAge !== undefined) {
          return scopedSettings.minimumReleaseAge;
        }

        if (options.scope === "project") {
          const globalSettings = yield* readSettingsSafe(userRuntimeDir, "user");
          if (globalSettings.minimumReleaseAge !== undefined) {
            return globalSettings.minimumReleaseAge;
          }
        }

        return DEFAULT_MINIMUM_RELEASE_AGE satisfies MinimumReleaseAge;
      }),

      getMinimumReleaseAgeExclude: Effect.fn("WorkspaceMutations.getMinimumReleaseAgeExclude")(
        function* () {
          const scopedSettings = yield* readSettingsSafe(workspaceDir);
          if (scopedSettings.minimumReleaseAgeExclude !== undefined) {
            return scopedSettings.minimumReleaseAgeExclude.map(
              (pattern): ScopedReleaseAgeExcludePattern => ({ pattern, scope: options.scope }),
            );
          }

          if (options.scope === "project") {
            const globalSettings = yield* readSettingsSafe(userRuntimeDir, "user");
            if (globalSettings.minimumReleaseAgeExclude !== undefined) {
              return globalSettings.minimumReleaseAgeExclude.map(
                (pattern): ScopedReleaseAgeExcludePattern => ({ pattern, scope: "user" }),
              );
            }
          }

          return [];
        },
      ),

      addConfiguredSource: (source: SourceHostConfig) =>
        withMutex(
          Effect.gen(function* () {
            const current = yield* readSettingsSafe(workspaceDir);
            const currentSources: ReadonlyArray<SourceHostConfig> = current.sources ?? [];
            const updatedSettings = { ...current, sources: [...currentSources, source] };
            yield* writeScopedSettings(updatedSettings).pipe(Effect.provide(fsLayer));
            cachedSources = null; // invalidate cache
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.addConfiguredSource")),

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
          Effect.map((s) => Option.fromUndefinedOr(s.instructionFiles)),
          Effect.withSpan("WorkspaceMutations.getInstructionsConfig"),
        ),

      setInstructionsConfig: (config: InstructionsConfigValue) =>
        withMutex(
          Effect.gen(function* () {
            const current = yield* readSettingsSafe(workspaceDir);
            const updatedSettings: Settings = {
              ...current,
              instructionFiles: config,
            };
            yield* writeScopedSettings(updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setInstructionsConfig")),

      getConfiguredMcpServerEntries: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s): McpServersMap => s.mcpServers ?? {}),
          Effect.withSpan("WorkspaceMutations.getConfiguredMcpServerEntries"),
        ),

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
                    const locator = Option.isSome(versionRange)
                      ? `${fqn}@${versionRange.value}`
                      : fqn;
                    return `${lockEntry.sourceName}:${locator}`;
                  })()
                : printSourceParams(lockEntryToSourceParams(lockEntry));
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentRules: RulesMap = currentSettings.rules ?? {};
            yield* writeScopedSettings({
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
                [name]: preserveAcceptedResolutionOnNoop(previous, lockEntry),
              },
            };
            yield* commitWorkspaceState(currentLockfile, updatedLockfile);
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
                [name]: preserveAcceptedResolutionOnNoop(previous, lockEntry),
              },
            };
            yield* commitWorkspaceState(currentLockfile, updatedLockfile);
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

            yield* writeScopedSettings(remainingSettings).pipe(Effect.provide(fsLayer));
            yield* commitLockfileSnapshotUpdateAtPath(
              lockPath,
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
            yield* writeScopedSettings({
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
            yield* commitLockfileSnapshotUpdateAtPath(
              lockPath,
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
            yield* writeScopedSettings({
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
            yield* writeScopedSettings({
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
                    const locator = Option.isSome(versionRange)
                      ? `${fqn}@${versionRange.value}`
                      : fqn;
                    return `${lockEntry.sourceName}:${locator}`;
                  })()
                : printSourceParams(lockEntryToSourceParams(lockEntry));
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentHooks: HooksMap = currentSettings.hooks ?? {};
            yield* writeScopedSettings({
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
                [name]: preserveAcceptedResolutionOnNoop(previous, lockEntry),
              },
            };
            yield* commitWorkspaceState(currentLockfile, updatedLockfile);
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
                [name]: preserveAcceptedResolutionOnNoop(previous, lockEntry),
              },
            };
            yield* commitWorkspaceState(currentLockfile, updatedLockfile);
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

            yield* writeScopedSettings(remainingSettings).pipe(Effect.provide(fsLayer));
            yield* commitLockfileSnapshotUpdateAtPath(
              lockPath,
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
            yield* writeScopedSettings({
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
            yield* commitLockfileSnapshotUpdateAtPath(
              lockPath,
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
            yield* writeScopedSettings({
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
            yield* writeScopedSettings({
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

      getKnowledgeDiscoveryConfig: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((settings) =>
            resolveKnowledgeDiscoveryConfig({
              ...(settings.knowledgeConfig?.instructions === false ? { instructions: false } : {}),
            }),
          ),
          Effect.withSpan("WorkspaceMutations.getKnowledgeDiscoveryConfig"),
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
                    const locator = Option.isSome(versionRange)
                      ? `${fqn}@${versionRange.value}`
                      : fqn;
                    return `${lockEntry.sourceName}:${locator}`;
                  })()
                : printSourceParams(lockEntryToSourceParams(lockEntry));
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentKnowledge: KnowledgeMap = currentSettings.knowledge ?? {};
            const currentEntry = currentKnowledge[name];
            yield* writeScopedSettings({
              ...currentSettings,
              knowledge: {
                ...currentKnowledge,
                [name]: {
                  source,
                  enabled: true,
                  ...(currentEntry?.instructionEntry === undefined
                    ? {}
                    : { instructionEntry: currentEntry.instructionEntry }),
                },
              },
            }).pipe(Effect.provide(fsLayer));

            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLocked = currentLockfile.knowledge ?? {};
            const previous = currentLocked[name];
            yield* commitWorkspaceState(currentLockfile, {
              ...currentLockfile,
              knowledge: {
                ...currentLocked,
                [name]: preserveAcceptedResolutionOnNoop(previous, lockEntry),
              },
            });
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setKnowledge")),

      setKnowledgeLock: ({ name, lockEntry }: SetKnowledgeArgs) =>
        withMutex(
          Effect.gen(function* () {
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLocked = currentLockfile.knowledge ?? {};
            const previous = currentLocked[name];
            yield* commitWorkspaceState(currentLockfile, {
              ...currentLockfile,
              knowledge: {
                ...currentLocked,
                [name]: preserveAcceptedResolutionOnNoop(previous, lockEntry),
              },
            });
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
            yield* writeScopedSettings(nextSettings).pipe(Effect.provide(fsLayer));
            yield* commitLockfileSnapshotUpdateAtPath(lockPath, currentLockfile, nextLockfile).pipe(
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
            yield* writeScopedSettings({
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
            yield* commitLockfileSnapshotUpdateAtPath(lockPath, currentLockfile, {
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
            yield* writeScopedSettings({
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
            yield* writeScopedSettings({
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
            return computeSkillPathsForLayout(path.join, layout, source, sanitizeName(dirName));
          }

          const lockEntry = yield* readLockfileSafe(workspaceDir).pipe(
            Effect.map((lf) => Option.fromUndefinedOr(lf.skills[name])),
          );

          if (Option.isNone(lockEntry)) {
            return yield* new LockedSkillMissing({ name });
          }

          const entry = lockEntry.value;
          const entrySource: SkillPathSource = (() => {
            switch (entry.type) {
              case "registry":
                return {
                  refType: "registry",
                  owner: entry.owner,
                  source: {
                    type: "registry",
                    name: entry.sourceName,
                    location: entry.endpoint,
                    owner: Option.some(entry.owner),
                  },
                };
              case "local":
                return {
                  refType: "local",
                  source: { type: "local", path: entry.path },
                  sourcePath: entry.path,
                };
              case "github":
              case "gitlab":
              case "bitbucket":
                return {
                  refType: "git-hosted",
                  source: {
                    type: entry.type,
                    name: entry.sourceName,
                    url: entry.endpoint,
                    owner: entry.owner,
                    repo: entry.repo,
                    ref: Option.fromUndefinedOr(entry.ref),
                    subPath: Option.fromUndefinedOr(entry.path),
                  },
                  ...(entry.path === undefined ? {} : { sourcePath: entry.path }),
                };
              case "azurerepos":
                return {
                  refType: "git-hosted",
                  source: {
                    type: "azurerepos",
                    name: entry.sourceName,
                    url: entry.endpoint,
                    organization: entry.organization,
                    project: entry.project,
                    repo: entry.repo,
                    ref: Option.fromUndefinedOr(entry.ref),
                    subPath: Option.fromUndefinedOr(entry.path),
                  },
                  ...(entry.path === undefined ? {} : { sourcePath: entry.path }),
                };
              case "git":
                return {
                  refType: "git-hosted",
                  source: {
                    type: "git",
                    url: new URL(entry.url),
                    ref: Option.fromUndefinedOr(entry.ref),
                  },
                  ...(entry.path === undefined ? {} : { sourcePath: entry.path }),
                };
            }
          })();

          const dirName = entry.type === "registry" ? entry.name : entry.packageName;
          return computeSkillPathsForLayout(path.join, layout, entrySource, sanitizeName(dirName));
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
                    const locator = Option.isSome(versionRange)
                      ? `${fqn}@${versionRange.value}`
                      : fqn;
                    return `${lockEntry.sourceName}:${locator}`;
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
              yield* writeScopedSettings(updatedSettings).pipe(Effect.provide(fsLayer));
            }

            if (!lockChanged) return;

            const updatedLockfile = {
              ...currentLockfile,
              skills: {
                ...currentLockfile.skills,
                [name]: preserveAcceptedResolutionOnNoop(currentLockEntry, lockEntry),
              },
            };
            yield* commitWorkspaceState(currentLockfile, updatedLockfile);
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
                [name]: preserveAcceptedResolutionOnNoop(currentLockEntry, lockEntry),
              },
            };
            yield* commitWorkspaceState(currentLockfile, updatedLockfile);
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
              yield* writeScopedSettings(updatedSettings).pipe(Effect.provide(fsLayer));
            }

            // Update lockfile
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const hasLockfileEntry = name in currentLockfile.skills;
            if (hasLockfileEntry) {
              const { [name]: __, ...remainingLockSkills } = currentLockfile.skills;
              void __;
              const updatedLockfile = { ...currentLockfile, skills: remainingLockSkills };
              yield* commitLockfileSnapshotUpdateAtPath(
                lockPath,
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
            yield* writeScopedSettings(updatedSettings).pipe(Effect.provide(fsLayer));
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
              () => new SettingsEntryMissing({ entryType: "skill", name }),
            );
            const updated = updater(currentEntry);
            const updatedSettings = {
              ...currentSettings,
              skills: { ...currentSkills, [name]: updated },
            };
            yield* writeScopedSettings(updatedSettings).pipe(Effect.provide(fsLayer));
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
            yield* writeScopedSettings(updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ),

      addConfiguredAgent: (agentId: string) =>
        withMutex(
          Effect.gen(function* () {
            const validId = yield* Schema.decodeUnknownEffect(ConfigurableAgentIdSchema)(
              agentId,
            ).pipe(Effect.mapError((cause) => new InvalidAgentId({ agentId, cause })));
            const current = yield* readSettingsSafe(workspaceDir);
            const agents = current.agents ?? [];
            if (agents.includes(validId)) return;
            const updatedSettings: Settings = { ...current, agents: [...agents, validId] };
            yield* writeScopedSettings(updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ),

      removeConfiguredAgent: (agentId: string) =>
        withMutex(
          Effect.gen(function* () {
            const validId = yield* Schema.decodeUnknownEffect(ConfigurableAgentIdSchema)(
              agentId,
            ).pipe(Effect.mapError((cause) => new InvalidAgentId({ agentId, cause })));
            const current = yield* readSettingsSafe(workspaceDir);
            const agents = current.agents ?? [];
            if (!agents.includes(validId)) return;
            const updatedSettings: Settings = {
              ...current,
              agents: agents.filter((configured) => configured !== validId),
            };
            yield* writeScopedSettings(updatedSettings).pipe(Effect.provide(fsLayer));
          }),
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
            const locator = Option.isSome(versionRange) ? `${fqn}@${versionRange.value}` : fqn;
            const source = `${lockEntry.sourceName}:${locator}`;
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentPacks: PacksMap = currentSettings.packs ?? {};
            const enabled = currentPacks[name]?.enabled ?? true;
            const updatedSettings = {
              ...currentSettings,
              packs: { ...currentPacks, [name]: { source, enabled } },
            };
            yield* writeScopedSettings(updatedSettings).pipe(Effect.provide(fsLayer));

            // Update lockfile
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedPacks = currentLockfile.packs ?? {};
            const updatedLockfile = {
              ...currentLockfile,
              packs: {
                ...currentLockedPacks,
                [name]: preserveAcceptedResolutionOnNoop(currentLockedPacks[name], lockEntry),
              },
            };
            yield* commitWorkspaceState(currentLockfile, updatedLockfile);
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setPack")),

      setPackLock: (args: SetPackArgs) =>
        withMutex(
          Effect.gen(function* () {
            const { versionRange: _, ...lockEntry } = args;
            void _;
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedPacks = currentLockfile.packs ?? {};
            const updatedLockfile = {
              ...currentLockfile,
              packs: {
                ...currentLockedPacks,
                [lockEntry.name]: preserveAcceptedResolutionOnNoop(
                  currentLockedPacks[lockEntry.name],
                  lockEntry,
                ),
              },
            };
            yield* commitWorkspaceState(currentLockfile, updatedLockfile);
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setPackLock")),

      setPackEntry: (name: string, entry: PackEntry) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentPacks: PacksMap = currentSettings.packs ?? {};
            const updatedSettings = {
              ...currentSettings,
              packs: { ...currentPacks, [name]: entry },
            };
            yield* writeScopedSettings(updatedSettings).pipe(Effect.provide(fsLayer));
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
            yield* writeScopedSettings(updatedSettings).pipe(Effect.provide(fsLayer));

            // Update lockfile
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedPacks = currentLockfile.packs ?? {};
            if (name in currentLockedPacks) {
              const { [name]: __, ...remainingLockedPacks } = currentLockedPacks;
              void __;
              const updatedLockfile = { ...currentLockfile, packs: remainingLockedPacks };
              yield* commitLockfileSnapshotUpdateAtPath(
                lockPath,
                currentLockfile,
                updatedLockfile,
              ).pipe(Effect.provide(fsLayer));
            }
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.removePack")),

      getPackDir: (name: string, owner: Handle, sourceName: string) =>
        Effect.succeed(computePackPathsForLayout(path.join, layout, sourceName, owner, name)),

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

      setSubagent: ({ name, lockEntry, versionRange }: SetSubagentArgs) =>
        withMutex(
          Effect.gen(function* () {
            // Update settings
            const source =
              lockEntry.type === "registry"
                ? (() => {
                    const fqn = formatFqn({
                      owner: lockEntry.owner,
                      type: "subagent",
                      name: decodeExtensionNameSync(name),
                    });
                    const locator = Option.isSome(versionRange)
                      ? `${fqn}@${versionRange.value}`
                      : fqn;
                    return `${lockEntry.sourceName}:${locator}`;
                  })()
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
              yield* writeScopedSettings(updatedSettings).pipe(Effect.provide(fsLayer));
            }

            if (!lockChanged) return;

            const updatedLockfile = {
              ...currentLockfile,
              subagents: {
                ...currentLockedSubagents,
                [name]: preserveAcceptedResolutionOnNoop(currentLockEntry, lockEntry),
              },
            };
            yield* commitWorkspaceState(currentLockfile, updatedLockfile);
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
                [name]: preserveAcceptedResolutionOnNoop(currentLockedSubagents[name], lockEntry),
              },
            };
            yield* commitWorkspaceState(currentLockfile, updatedLockfile);
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
              yield* writeScopedSettings(updatedSettings).pipe(Effect.provide(fsLayer));
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
              yield* commitLockfileSnapshotUpdateAtPath(
                lockPath,
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
            yield* writeScopedSettings(updatedSettings).pipe(Effect.provide(fsLayer));
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
            yield* writeScopedSettings(updatedSettings).pipe(Effect.provide(fsLayer));
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
            yield* writeScopedSettings(updatedSettings).pipe(Effect.provide(fsLayer));
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
            yield* commitLockfileSnapshotUpdateAtPath(
              lockPath,
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

      getLockedMcpServer: (resolutionKey: string) =>
        readLockfileSafe(workspaceDir).pipe(
          Effect.map((lf) => Option.fromUndefinedOr((lf.mcpServers ?? {})[resolutionKey])),
        ),

      getLockedMcpServerForConnection: (localName: string) =>
        Effect.gen(function* () {
          const graph = yield* readDesiredStateGraph();
          const node = graph.nodes.find(
            (candidate) => candidate.type === "mcp-server" && candidate.name === localName,
          );
          if (node === undefined || node.authority === "inline") return Option.none();
          const lockfile = yield* readLockfileSafe(workspaceDir);
          return Option.fromUndefinedOr((lockfile.mcpServers ?? {})[node.identity]);
        }),

      setMcpServer: ({
        name,
        resolutionKey,
        lockEntry,
        versionRange,
        env,
        enabled,
      }: SetMcpServerArgs) =>
        withMutex(
          Effect.gen(function* () {
            // Update settings (uses "mcpServers" key)
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentMcpServers: McpServersMap = currentSettings.mcpServers ?? {};
            const currentEnabled = currentMcpServers[name]?.enabled ?? true;
            const currentEnv = currentMcpServers[name]?.env ?? {};
            const settingsEntry = {
              kind: "sourced" as const,
              source:
                lockEntry.type === "registry"
                  ? (() => {
                      const fqn = formatFqn({
                        owner: lockEntry.owner,
                        type: "mcp-server",
                        name: lockEntry.name,
                      });
                      const locator = Option.isSome(versionRange)
                        ? `${fqn}@${versionRange.value}`
                        : fqn;
                      return `${lockEntry.sourceName}:${locator}`;
                    })()
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
            yield* writeScopedSettings(updatedSettings).pipe(Effect.provide(fsLayer));

            // Update lockfile (uses "mcpServers" key)
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedMcpServers = currentLockfile.mcpServers ?? {};
            const updatedLockfile = {
              ...currentLockfile,
              mcpServers: {
                ...currentLockedMcpServers,
                [resolutionKey]: preserveAcceptedResolutionOnNoop(
                  currentLockedMcpServers[resolutionKey],
                  lockEntry,
                ),
              },
            };
            yield* commitWorkspaceState(currentLockfile, updatedLockfile);
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setMcpServer")),

      setMcpServerLock: ({ name: _name, resolutionKey, lockEntry }: SetMcpServerArgs) =>
        withMutex(
          Effect.gen(function* () {
            // Update lockfile only (skip settings) — used for pack dependencies
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedMcpServers = currentLockfile.mcpServers ?? {};
            const updatedLockfile = {
              ...currentLockfile,
              mcpServers: {
                ...currentLockedMcpServers,
                [resolutionKey]: preserveAcceptedResolutionOnNoop(
                  currentLockedMcpServers[resolutionKey],
                  lockEntry,
                ),
              },
            };
            yield* commitWorkspaceState(currentLockfile, updatedLockfile);
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
              () => new SettingsEntryMissing({ entryType: "mcp-server", name }),
            );
            const updated = updater(currentEntry);
            const updatedSettings = {
              ...currentSettings,
              mcpServers: { ...currentMcpServers, [name]: updated },
            };
            yield* writeScopedSettings(updatedSettings).pipe(Effect.provide(fsLayer));
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
            yield* writeScopedSettings(updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ),

      removeMcpServer: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const graph = yield* readDesiredStateGraph();
            const desiredNode = graph.nodes.find(
              (node) => node.type === "mcp-server" && node.name === name,
            );
            const closure =
              desiredNode === undefined || desiredNode.authority === "inline"
                ? undefined
                : graph.mcpSourceClosures.find(
                    (candidate) => candidate.identity === desiredNode.identity,
                  );
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
              yield* writeScopedSettings(updatedSettings).pipe(Effect.provide(fsLayer));
            }

            // Update lockfile (uses "mcpServers" key)
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedMcpServers = currentLockfile.mcpServers ?? {};
            const resolutionKey = desiredNode?.identity;
            const keepSharedResolution =
              closure !== undefined &&
              (closure.localNames.length > 1 ||
                closure.origins.some((origin) => origin.type === "pack"));
            if (
              resolutionKey !== undefined &&
              !keepSharedResolution &&
              resolutionKey in currentLockedMcpServers
            ) {
              const { [resolutionKey]: __, ...remainingLockedMcpServers } = currentLockedMcpServers;
              void __;
              const updatedLockfile = {
                ...currentLockfile,
                mcpServers: remainingLockedMcpServers,
              };
              yield* commitLockfileSnapshotUpdateAtPath(
                lockPath,
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
            yield* commitLockfileSnapshotUpdateAtPath(
              lockPath,
              currentLockfile,
              updatedLockfile,
            ).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.removeSkillLock")),

      removeMcpServerSettings: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentMcpServers: McpServersMap = currentSettings.mcpServers ?? {};
            if (!(name in currentMcpServers)) return;
            const { [name]: _, ...remainingMcpServers } = currentMcpServers;
            void _;
            const updatedSettings = { ...currentSettings, mcpServers: remainingMcpServers };
            yield* writeScopedSettings(updatedSettings).pipe(Effect.provide(fsLayer));
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
            yield* commitLockfileSnapshotUpdateAtPath(
              lockPath,
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
            yield* writeScopedSettings(updatedSettings).pipe(Effect.provide(fsLayer));
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
            yield* commitLockfileSnapshotUpdateAtPath(
              lockPath,
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
          if (target.type === "pack") return false;
          const graph = yield* readDesiredStateGraph();
          if (!graph.complete) {
            return yield* new DesiredPackGraphIncomplete();
          }
          return graph.nodes.some(
            (node) =>
              node.type === target.type &&
              node.name === target.name &&
              node.origins.some((origin) => origin.type === "pack"),
          );
        }),
    };
  });
