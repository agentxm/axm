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
  commitTrustSnapshotUpdate,
  type ResolvedExtension,
  type ResolvedExtensionMap,
  type HooksLockMap,
  type KnowledgeLockMap,
  type RulesLockMap,
  type SkillLockEntry,
  type SubagentLockEntry,
  type SubagentsLockMap,
} from "../lockfile/index.js";
import type { Lockfile } from "../lockfile/schema.js";
import { computeSkillPaths } from "../skills/paths.js";
import { computePackPaths } from "../packs/paths.js";
import type { Handle } from "../extensions/handle.js";
import type { InstallableExtensionType } from "../extensions/installable-types.js";
import { sanitizeName } from "../extensions/utils.js";
import {
  ConfigurableAgentIdSchema,
  decodeExtensionNameSync,
  formatFqn,
  parseExtensionFqnParts,
  parseRegistrySourcePatternParts,
  type SourceHash,
  SourceHashSchema,
} from "../extensions/index.js";
import { decodeVersionSync } from "../version-constraints/version-constraints.js";
import { type AppError, BC, makeAppError } from "../app-error/index.js";
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
  SETTINGS_FILENAME,
  type SkillsMap,
  type SubagentsMap,
  type SourceHostConfig,
  writeSettings,
} from "../settings/index.js";
import { DEFAULT_MINIMUM_RELEASE_AGE } from "../registry/index.js";
import { lockEntryToSourceParams, printSourceParams } from "../sources/index.js";
import { makeAbsolutePath } from "../utils/path-types.js";
import { resolveKnowledgeDiscoveryConfig } from "../knowledge/discovery-config.js";
import {
  readWorkspaceTrustState,
  TRUST_STATE_FILENAME,
  TRUST_STATE_VERSION,
  trustRecordKey,
  trustStateFromLockfile,
  writeWorkspaceTrustState,
  type PackTrustManifest,
  type WorkspaceTrustState,
} from "../trust/index.js";

import { withStrictLockfileReads } from "./lockfile-read-tolerance.js";
import { getAxmDir } from "./paths.js";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as semver from "semver";
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
  type SetRuleArgs,
  type SetHookArgs,
  type SetKnowledgeArgs,
  type SetMcpServerArgs,
  type SetSubagentArgs,
  type SkillPathSource,
  type ExtensionTarget,
  type WorkspaceCommitPhase,
  type WorkspaceTransactionRunner,
} from "./service-interface.js";
import type { LockfileState } from "./augment-plan.js";
import { makeReadModelRecordReaders } from "./read-model-record-readers.js";
import { buildDesiredStateGraph } from "./desired-state-graph.js";
import { validateDesiredPackTrust } from "./desired-pack-trust.js";
import { runWorkspaceTransaction } from "./transaction.js";
const createEmptyLockfile = (): Lockfile => ({
  lockfileVersion: LOCKFILE_VERSION,
  skills: {},
});
const createEmptyTrustState = (): WorkspaceTrustState => ({
  trustStateVersion: TRUST_STATE_VERSION,
  records: {},
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

    const commitWorkspaceState = (
      base: Lockfile,
      next: Lockfile,
      commit: WorkspaceCommitPhase = "both",
    ) =>
      commit === "authoritative"
        ? commitTrustSnapshotUpdate(workspaceDir, base, next).pipe(Effect.provide(fsLayer))
        : commitLockfileSnapshotUpdate(workspaceDir, base, next, {
            preserveTrust: commit === "receipt",
          }).pipe(Effect.provide(fsLayer));

    const runTransaction: WorkspaceTransactionRunner = (args) =>
      runWorkspaceTransaction({
        workspaceDir,
        targets: [
          settingsPath,
          path.join(workspaceDir, TRUST_STATE_FILENAME),
          ...(args.targets ?? []),
        ],
        transition: args.transition,
        validate: args.validate,
        ...(args.receipt === undefined ? {} : { receipt: args.receipt }),
      }).pipe(Effect.provide(fsLayer));

    const readTrustState = () =>
      readWorkspaceTrustState(workspaceDir).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
        Effect.flatMap(
          Option.match({
            onNone: () => readLockfileSafe(workspaceDir).pipe(Effect.map(trustStateFromLockfile)),
            onSome: Effect.succeed,
          }),
        ),
      );

    const readAuthoritativeTrustState = () =>
      readWorkspaceTrustState(workspaceDir).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
        Effect.map(Option.getOrElse(createEmptyTrustState)),
      );

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

    const readDesiredStateGraph = () =>
      Effect.gen(function* () {
        const settings = yield* readSettingsSafe(workspaceDir);
        const graph = yield* buildDesiredStateGraph({ baseDir, settings }).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        );
        // A valid legacy lockfile is the one-time migration source when a
        // workspace has not written trust.json yet. Once the dedicated trust
        // document exists, readTrustState ignores receipt content entirely.
        // This keeps existing configured packs usable on the first command
        // after upgrade without accepting an invalid or missing baseline.
        const trust = yield* readTrustState();
        return yield* validateDesiredPackTrust({ baseDir, graph, trust }).pipe(
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

    const resolvePackReceipt = (
      manifest: PackTrustManifest,
      trust: WorkspaceTrustState,
    ): Effect.Effect<
      {
        readonly resolvedSkills: ResolvedExtensionMap;
        readonly resolvedMcpServers: ResolvedExtensionMap;
        readonly resolvedSubagents: ResolvedExtensionMap;
        readonly resolvedRules: ResolvedExtensionMap;
        readonly resolvedHooks: ResolvedExtensionMap;
        readonly resolvedKnowledge: ResolvedExtensionMap;
      },
      AppError
    > =>
      Effect.gen(function* () {
        const groups: Record<
          Exclude<InstallableExtensionType, "pack">,
          Record<string, ResolvedExtension>
        > = {
          skill: {},
          "mcp-server": {},
          subagent: {},
          rule: {},
          hook: {},
          knowledge: {},
        };
        for (const [fqn, constraint] of Object.entries(manifest.dependencies)) {
          const parsed = parseExtensionFqnParts(fqn);
          if (parsed === undefined || parsed.type === "pack") {
            return yield* makeAppError({
              code: "validation",
              detail: `Invalid pack dependency identity: ${fqn}`,
            });
          }
          const record = trust.records[trustRecordKey(parsed.type, parsed.name)];
          if (
            record === undefined ||
            record.resolvedVersion === undefined ||
            !semver.satisfies(record.resolvedVersion, constraint)
          ) {
            return yield* makeAppError({
              code: "conflict",
              detail: `Pack dependency ${fqn} requires ${constraint}, but trusted workspace state has ${record?.resolvedVersion ?? "no resolved version"}.`,
            });
          }
          const version = decodeVersionSync(record.resolvedVersion);
          if (record.authority === "workspace" && record.contentIdentity !== undefined) {
            const contentIdentity = yield* Schema.decodeUnknownEffect(SourceHashSchema)(
              record.contentIdentity,
            ).pipe(
              Effect.mapError((cause) =>
                makeAppError({
                  code: "validation",
                  detail: `Trusted content identity for ${fqn} is invalid`,
                  cause,
                }),
              ),
            );
            groups[parsed.type][fqn] = {
              source: "workspace",
              version,
              sourceIdentity: record.sourceIdentity,
              contentIdentity,
            };
            continue;
          }
          if (
            record.authority === "registry" &&
            record.publisherBindingId !== undefined &&
            record.integrity !== undefined
          ) {
            groups[parsed.type][fqn] = {
              source: "registry",
              version,
              publisherBindingId: record.publisherBindingId,
              integrity: record.integrity,
            };
            continue;
          }
          return yield* makeAppError({
            code: "conflict",
            detail: `Pack dependency ${fqn} has unsupported trusted authority ${record.authority}.`,
          });
        }
        return {
          resolvedSkills: groups.skill,
          resolvedMcpServers: groups["mcp-server"],
          resolvedSubagents: groups.subagent,
          resolvedRules: groups.rule,
          resolvedHooks: groups.hook,
          resolvedKnowledge: groups.knowledge,
        };
      });

    return {
      scope: options.scope,
      path: workspaceDir,
      baseDir,

      runTransaction,

      getLockfileState,

      getDesiredStateGraph: () =>
        readDesiredStateGraph().pipe(Effect.withSpan("WorkspaceMutations.getDesiredStateGraph")),

      getTrustState: () =>
        readTrustState().pipe(Effect.withSpan("WorkspaceMutations.getTrustState")),

      removeTrustRecord: (type: InstallableExtensionType, name: string) =>
        withMutex(
          Effect.gen(function* () {
            const trust = yield* readAuthoritativeTrustState();
            const key = trustRecordKey(type, name);
            if (!(key in trust.records)) return;
            const { [key]: _, ...remainingRecords } = trust.records;
            void _;
            yield* writeWorkspaceTrustState(workspaceDir, {
              ...trust,
              records: remainingRecords,
            }).pipe(
              Effect.provideService(FileSystem.FileSystem, fs),
              Effect.provideService(Path.Path, path),
            );
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.removeTrustRecord")),

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

      setRule: ({ name, lockEntry, versionRange, commit }: SetRuleArgs) =>
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
            yield* commitWorkspaceState(currentLockfile, updatedLockfile, commit);
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setRule")),

      setRuleLock: ({ name, lockEntry, commit }: SetRuleArgs) =>
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
            yield* commitWorkspaceState(currentLockfile, updatedLockfile, commit);
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

      setHook: ({ name, lockEntry, versionRange, commit }: SetHookArgs) =>
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
            yield* commitWorkspaceState(currentLockfile, updatedLockfile, commit);
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setHook")),

      setHookLock: ({ name, lockEntry, commit }: SetHookArgs) =>
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
            yield* commitWorkspaceState(currentLockfile, updatedLockfile, commit);
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

      setKnowledge: ({ name, lockEntry, versionRange, commit }: SetKnowledgeArgs) =>
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
            yield* commitWorkspaceState(
              currentLockfile,
              {
                ...currentLockfile,
                knowledge: {
                  ...currentLocked,
                  [name]: yield* preserveLockTimestampsOnNoop(previous, lockEntry),
                },
              },
              commit,
            );
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setKnowledge")),

      setKnowledgeLock: ({ name, lockEntry, commit }: SetKnowledgeArgs) =>
        withMutex(
          Effect.gen(function* () {
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLocked = currentLockfile.knowledge ?? {};
            const previous = currentLocked[name];
            yield* commitWorkspaceState(
              currentLockfile,
              {
                ...currentLockfile,
                knowledge: {
                  ...currentLocked,
                  [name]: yield* preserveLockTimestampsOnNoop(previous, lockEntry),
                },
              },
              commit,
            );
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

      setSkill: ({ name, lockEntry, versionRange, commit }: SetSkillArgs) =>
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
            yield* commitWorkspaceState(currentLockfile, updatedLockfile, commit);
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setSkill")),

      setSkillLock: ({ name, lockEntry, commit }: SetSkillArgs) =>
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
            yield* commitWorkspaceState(currentLockfile, updatedLockfile, commit);
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
            const { versionRange, commit, ...lockEntry } = args;
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
            const enabled = currentPacks[name]?.enabled ?? true;
            const updatedSettings = {
              ...currentSettings,
              packs: { ...currentPacks, [name]: { source, enabled } },
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
            yield* commitWorkspaceState(currentLockfile, updatedLockfile, commit);
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setPack")),

      setPackLock: (args: SetPackArgs) =>
        withMutex(
          Effect.gen(function* () {
            const { versionRange: _, commit, ...lockEntry } = args;
            void _;
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentLockedPacks = currentLockfile.packs ?? {};
            const updatedLockfile = {
              ...currentLockfile,
              packs: {
                ...currentLockedPacks,
                [lockEntry.name]: yield* preserveLockTimestampsOnNoop(
                  currentLockedPacks[lockEntry.name],
                  lockEntry,
                ),
              },
            };
            yield* commitWorkspaceState(currentLockfile, updatedLockfile, commit);
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setPackLock")),

      refreshAuthoredContentIdentity: (
        type: Exclude<InstallableExtensionType, "pack">,
        name: string,
        resolvedVersion: string,
        contentIdentity: SourceHash,
      ) =>
        withMutex(
          Effect.gen(function* () {
            const trust = yield* readAuthoritativeTrustState();
            const key = trustRecordKey(type, name);
            const record = trust.records[key];
            if (record === undefined) return;
            if (record.authority !== "workspace") {
              return yield* makeAppError({
                code: "conflict",
                detail: `${type} "${name}" is not an authored workspace extension`,
                recover:
                  "Only a verified publish of a workspace-authored extension can advance its trust baseline.",
              });
            }
            yield* writeWorkspaceTrustState(workspaceDir, {
              ...trust,
              records: {
                ...trust.records,
                [key]: {
                  ...record,
                  resolvedVersion,
                  contentIdentity,
                },
              },
            }).pipe(
              Effect.provideService(FileSystem.FileSystem, fs),
              Effect.provideService(Path.Path, path),
            );
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.refreshAuthoredContentIdentity")),

      refreshPackContentIdentity: (
        name: string,
        contentIdentity: SourceHash,
        manifest?: PackTrustManifest,
        commit: WorkspaceCommitPhase = "both",
      ) =>
        withMutex(
          Effect.gen(function* () {
            const trust = yield* readAuthoritativeTrustState();
            const key = trustRecordKey("pack", name);
            const record = trust.records[key];
            if (record?.authority !== "workspace") {
              return yield* makeAppError({
                code: "conflict",
                detail: `Pack "${name}" is not an authored workspace pack`,
                recover: "Only workspace-authored packs can be edited in place.",
              });
            }
            const nextTrust = {
              ...trust,
              records: {
                ...trust.records,
                [key]: {
                  ...record,
                  contentIdentity,
                  ...(manifest === undefined ? {} : { packManifest: manifest }),
                },
              },
            };
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            const currentPack = currentLockfile.packs?.[name];
            const receipt =
              manifest === undefined || commit === "authoritative"
                ? undefined
                : yield* resolvePackReceipt(manifest, trust);
            if (
              commit !== "authoritative" &&
              manifest !== undefined &&
              (currentPack === undefined || currentPack.type !== "workspace")
            ) {
              return yield* makeAppError({
                code: "conflict",
                detail: `Workspace pack "${name}" has no matching workspace receipt`,
              });
            }
            const updatedLockfile =
              manifest === undefined || receipt === undefined || currentPack === undefined
                ? currentLockfile
                : {
                    ...currentLockfile,
                    packs: {
                      ...currentLockfile.packs,
                      [name]: {
                        ...currentPack,
                        version: decodeVersionSync(manifest.version),
                        sourceHash: contentIdentity,
                        ...receipt,
                      },
                    },
                  };
            if (commit !== "receipt") {
              yield* writeWorkspaceTrustState(workspaceDir, nextTrust).pipe(
                Effect.provideService(FileSystem.FileSystem, fs),
                Effect.provideService(Path.Path, path),
              );
            }
            if (commit !== "authoritative" && updatedLockfile !== currentLockfile) {
              yield* commitLockfileSnapshotUpdate(workspaceDir, currentLockfile, updatedLockfile, {
                preserveTrust: true,
              }).pipe(Effect.provide(fsLayer));
            }
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.refreshPackContentIdentity")),

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

      setSubagent: ({ name, lockEntry, versionRange, commit }: SetSubagentArgs) =>
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
                    return Option.isSome(versionRange) ? `${fqn}@${versionRange.value}` : fqn;
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
            yield* commitWorkspaceState(currentLockfile, updatedLockfile, commit);
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setSubagent")),

      setSubagentLock: ({ name, lockEntry, commit }: SetSubagentArgs) =>
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
            yield* commitWorkspaceState(currentLockfile, updatedLockfile, commit);
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

      setMcpServer: ({ name, lockEntry, versionRange, env, enabled, commit }: SetMcpServerArgs) =>
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
                        ? (() => {
                            const fqn = formatFqn({
                              owner: lockEntry.owner,
                              type: "mcp-server",
                              name: decodeExtensionNameSync(name),
                            });
                            return Option.isSome(versionRange)
                              ? `${fqn}@${versionRange.value}`
                              : fqn;
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
            yield* commitWorkspaceState(currentLockfile, updatedLockfile, commit);
          }),
        ).pipe(Effect.withSpan("WorkspaceMutations.setMcpServer")),

      setMcpServerLock: ({ name, lockEntry, commit }: SetMcpServerArgs) =>
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
            yield* commitWorkspaceState(currentLockfile, updatedLockfile, commit);
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
          if (target.type === "pack") return false;
          const graph = yield* readDesiredStateGraph();
          if (!graph.complete) {
            return yield* makeAppError({
              code: "conflict",
              detail: "Cannot decide pack retention because the desired pack graph is incomplete.",
              recover: "Restore or reinstall configured pack manifests, then retry.",
            });
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
