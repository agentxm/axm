/**
 * Workspace context service implementation.
 *
 * This is the sole public gateway for all settings and lockfile read/write
 * operations. It calls the I/O functions (`readSettings`, `writeSettings`,
 * `readLockfile`, `writeLockfile`) directly and manages mutation
 * serialization via a single Semaphore(1). No other service should perform
 * settings or lockfile I/O in production; the per-service semaphores in
 * `settings/service.ts` and `lockfile/service.ts` have been removed.
 *
 * Supporting logic is split into focused modules:
 * - `taxonomy-types.ts` — classifier-backed type definitions
 * - `source-metadata.ts` — source metadata derivation helpers
 * - `initialization.ts` — workspace initialization (agent detection, settings creation)
 * - `classifier-records.ts` — classifier row → record map converters
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { getAgentById } from "../agents/index.js";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import {
  LOCKFILE_NAME,
  makeRegistryExtensionPackLockEntry,
  readLockfile,
  writeLockfile,
  type CommandsLockMap,
  type McpServersLockMap,
  type ExtensionPacksLockMap,
  type RegistryExtensionPackLockEntry,
  type SubagentsLockMap,
} from "../lockfile/index.js";
import { computeSkillPaths } from "../skills/paths.js";
import { computeExtensionPackPaths } from "../packs/paths.js";
import type { Handle } from "../extensions/handle.js";
import { sanitizeName } from "../extensions/utils.js";
import {
  AgentIdSchema,
  decodeExtensionNameSync,
  formatFqn,
  parseFullyQualifiedNameParts,
  parseRegistrySourcePatternParts,
  type ExtensionType,
} from "../extensions/index.js";
import { type AppError, makeAppError } from "../app-error/index.js";
import {
  collapseCommandEntry,
  collapseSkillEntry,
  collapseSubagentEntry,
  type CommandsMap,
  createDefaultSettings,
  DEFAULT_PROFILE,
  getCommandEntrySource,
  getSkillEntrySource,
  getSubagentEntrySource,
  type McpServersMap,
  type NormalizedCommandEntry,
  normalizeCommandEntry,
  type NormalizedSkillEntry,
  normalizeSkillEntry,
  type NormalizedSubagentEntry,
  normalizeSubagentEntry,
  type ExtensionPacksMap,
  readSettings,
  type Settings,
  type SkillsMap,
  type SubagentsMap,
  type SourceHostConfig,
  writeSettings,
} from "../settings/index.js";
import { lockEntryToSourceParams, printSourceParams } from "../sources/index.js";

type WorkspaceManagedExtensionType = Extract<
  ExtensionType,
  "skill" | "command" | "mcp-server" | "pack" | "subagent"
>;
import { getAxmDir } from "./paths.js";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
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
import { classifyExtensions } from "./classifier.js";
import { discoverSkillsInDir } from "../source-resolution/index.js";
import {
  deriveSourceMetaForNonSkill,
  deriveSourceMetaForPacks,
  deriveSourceMetaForSkills,
} from "./source-metadata.js";
import {
  ensureGlobalWorkspaceInitialized,
  ensureProjectWorkspaceInitialized,
} from "./initialization.js";
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
/**
 * Collect extension names from pack resolvedExtension maps.
 *
 * Extracts the short name from each FQN key (e.g. "@acme/commands/formatter" -> "formatter")
 * across all pack lockfile entries for the given resolved map key.
 */
const collectTransitiveNames = (
  packLockEntries: ExtensionPacksLockMap,
  resolvedKey: "resolvedSkills" | "resolvedCommands" | "resolvedMcpServers" | "resolvedSubagents",
): ReadonlyArray<string> => {
  const names: Array<string> = [];
  for (const packEntry of Object.values(packLockEntries)) {
    const resolvedMap = packEntry[resolvedKey];
    for (const fqn of Object.keys(resolvedMap)) {
      const parsed = parseFullyQualifiedNameParts(fqn);
      if (parsed !== undefined) {
        names.push(parsed.name);
      }
    }
  }
  return names;
};

/**
 * Options for creating workspace context.
 */
export type WorkspaceLayerOptions = WorkspaceContextOptions;

/**
 * Create workspace context effect.
 *
 * Loads settings and lockfile based on workspace profile:
 * - User-scope mode: reads only user-scope settings (auto-creates with {} if not found)
 * - Project mode: merges user-scope and project settings (project overrides user),
 *   runs initialization flow if local settings don't exist
 *
 * When project initialization is needed and `yes=false` and `nonInteractive=false`,
 * CliPrompt service is required for agent selection.
 *
 * @param options - Workspace layer options
 * @returns Effect yielding WorkspaceContextService
 *
 * @internal Not exported from barrel - use layer() for external access
 */
const make = (options: WorkspaceLayerOptions) =>
  Effect.gen(function* () {
    const globalDir = yield* getAxmDir("user");
    const localDir = yield* getAxmDir("project");
    const workspaceDir = options.scope === "user" ? globalDir : localDir;

    if (options.scope === "user") {
      yield* ensureGlobalWorkspaceInitialized(globalDir);
    } else {
      yield* ensureProjectWorkspaceInitialized(localDir, options);
    }

    // Capture FileSystem and Path for use in closures
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const semaphore = yield* Semaphore.make(1);

    const baseDir = path.dirname(workspaceDir);

    const fsLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );

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
      readSettings(dir).pipe(
        Effect.map(Option.getOrElse(() => createDefaultSettings())),
        Effect.provide(fsLayer),
      );

    /**
     * Read lockfile from a directory, returning empty lockfile if not found.
     */
    const readLockfileSafe = (dir: string) => readLockfile(dir).pipe(Effect.provide(fsLayer));

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
     * Detect skill names on disk from configured agent skill directories.
     */
    const detectSkillNamesOnDisk = (agentIds: ReadonlyArray<string>) =>
      Effect.gen(function* () {
        const agentRoots = Array.getSomes(
          Array.map(agentIds, (agentId) =>
            Option.map(getAgentById(agentId), (agent) => path.join(baseDir, agent.skills.dir)),
          ),
        );
        const dedupedRoots = Array.dedupe(agentRoots);
        const discovered = yield* Effect.forEach(
          dedupedRoots,
          (agentRoot) =>
            discoverSkillsInDir(agentRoot, Option.none(), {
              fullDepth: false,
              includeInternal: false,
            }).pipe(
              Effect.catch(() =>
                Effect.succeed<ReadonlyArray<{ skill: { name: string }; location: string }>>([]),
              ),
              Effect.provide(fsLayer),
            ),
          { concurrency: "unbounded" },
        ).pipe(Effect.map(Array.flatten));
        return Array.dedupe(discovered.map((d) => d.skill.name));
      });

    /**
     * Classify extensions by type using the shared classifier.
     */
    const getClassifiedExtensions = (type: WorkspaceManagedExtensionType) =>
      Effect.gen(function* () {
        const settings = yield* readSettingsSafe(workspaceDir);
        const lockfile = yield* readLockfileSafe(workspaceDir);
        switch (type) {
          case "skill": {
            const detectedNames = yield* detectSkillNamesOnDisk(settings.agents ?? []);
            const configuredSkills = settings.skills ?? {};
            const configured = Object.fromEntries(
              Object.entries(configuredSkills).map(([name, entry]) => {
                const normalized = normalizeSkillEntry(entry);
                return [name, { source: normalized.source, enabled: normalized.enabled }];
              }),
            );
            return yield* classifyExtensions({
              type,
              configured,
              lockedNames: Object.keys(lockfile.skills),
              detectedNames,
              ignoredPatterns: settings.ignored?.skills ?? [],
              sourceMetaByName: deriveSourceMetaForSkills(settings, lockfile.skills, detectedNames),
            });
          }
          case "command": {
            const commandSettings = settings.commands ?? {};
            const commandLockEntries: CommandsLockMap = lockfile.commands ?? {};
            const configured = Object.fromEntries(
              Object.entries(commandSettings).map(([name, entry]) => {
                const normalized = normalizeCommandEntry(entry);
                return [name, { source: normalized.source, enabled: normalized.enabled }];
              }),
            );

            // Collect transitive command names from pack resolvedCommands
            const directLockedNames = Object.keys(commandLockEntries);
            const transitiveNames = collectTransitiveNames(
              lockfile.packs ?? {},
              "resolvedCommands",
            );
            const allLockedNames = Array.dedupe([...directLockedNames, ...transitiveNames]);

            // Build source metadata including transitive commands as native
            const directSourceMeta = deriveSourceMetaForNonSkill(
              Object.fromEntries(
                Object.entries(commandSettings).map(([name, entry]) => [
                  name,
                  getCommandEntrySource(entry),
                ]),
              ),
              commandLockEntries,
            );
            const sourceMetaByName: Record<
              string,
              { readonly packagingKind: "native" | "non-native" }
            > = { ...directSourceMeta };
            for (const name of transitiveNames) {
              if (!(name in sourceMetaByName)) {
                sourceMetaByName[name] = { packagingKind: "native" };
              }
            }

            return yield* classifyExtensions({
              type,
              configured,
              lockedNames: allLockedNames,
              detectedNames: [],
              ignoredPatterns: settings.ignored?.commands ?? [],
              sourceMetaByName,
            });
          }
          case "mcp-server": {
            const mcpSettings = settings.mcpServers ?? {};
            const mcpServerLockEntries: McpServersLockMap = lockfile.mcpServers ?? {};
            const configured = Object.fromEntries(
              Object.entries(mcpSettings).map(([name, source]) => [name, { source }]),
            );
            return yield* classifyExtensions({
              type,
              configured,
              lockedNames: Object.keys(mcpServerLockEntries),
              detectedNames: [],
              ignoredPatterns: settings.ignored?.mcpServers ?? [],
              sourceMetaByName: deriveSourceMetaForNonSkill(mcpSettings, mcpServerLockEntries),
            });
          }
          case "pack": {
            const packSettings = settings.packs ?? {};
            const packLockEntries: ExtensionPacksLockMap = lockfile.packs ?? {};
            const configured = Object.fromEntries(
              Object.entries(packSettings).map(([name, entry]) => {
                const source = typeof entry === "string" ? entry : entry.source;
                return [name, { source }];
              }),
            );
            return yield* classifyExtensions({
              type,
              configured,
              lockedNames: Object.keys(packLockEntries),
              detectedNames: [],
              ignoredPatterns: settings.ignored?.packs ?? [],
              sourceMetaByName: deriveSourceMetaForPacks(packSettings, packLockEntries),
            });
          }
          case "subagent": {
            const subagentSettings = settings.subagents ?? {};
            const subagentLockEntries: SubagentsLockMap = lockfile.subagents ?? {};
            const configured = Object.fromEntries(
              Object.entries(subagentSettings).map(([name, entry]) => {
                const normalized = normalizeSubagentEntry(entry);
                return [name, { source: normalized.source, enabled: normalized.enabled }];
              }),
            );

            // Collect transitive subagent names from pack resolvedSubagents
            const directLockedNames = Object.keys(subagentLockEntries);
            const transitiveNames = collectTransitiveNames(
              lockfile.packs ?? {},
              "resolvedSubagents",
            );
            const allLockedNames = Array.dedupe([...directLockedNames, ...transitiveNames]);

            // Build source metadata including transitive subagents as native
            const directSourceMeta = deriveSourceMetaForNonSkill(
              Object.fromEntries(
                Object.entries(subagentSettings).map(([name, entry]) => [
                  name,
                  getSubagentEntrySource(entry),
                ]),
              ),
              subagentLockEntries,
            );
            const sourceMetaByName: Record<
              string,
              { readonly packagingKind: "native" | "non-native" }
            > = { ...directSourceMeta };
            for (const name of transitiveNames) {
              if (!(name in sourceMetaByName)) {
                sourceMetaByName[name] = { packagingKind: "native" };
              }
            }

            return yield* classifyExtensions({
              type,
              configured,
              lockedNames: allLockedNames,
              detectedNames: [],
              ignoredPatterns: settings.ignored?.subagents ?? [],
              sourceMetaByName,
            });
          }
        }
      });

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
          const sourceStr = getSkillEntrySource(entry);
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
              skills: { ...currentSkills, [name]: source },
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

      updateSkillEntry: (
        name: string,
        updater: (entry: NormalizedSkillEntry) => NormalizedSkillEntry,
      ) =>
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
            const normalized = normalizeSkillEntry(currentEntry);
            const updated = updater(normalized);
            const collapsed = collapseSkillEntry(updated);
            const updatedSettings = {
              ...currentSettings,
              skills: { ...currentSkills, [name]: collapsed },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ),

      setSkillEntry: (name: string, entry: NormalizedSkillEntry) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentSkills: SkillsMap = currentSettings.skills ?? {};
            const collapsed = collapseSkillEntry(entry);
            const updatedSettings = {
              ...currentSettings,
              skills: { ...currentSkills, [name]: collapsed },
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
              packs: { ...currentPacks, [name]: source },
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
              commands: { ...currentCommands, [name]: source },
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

      updateCommandEntry: (
        name: string,
        updater: (entry: NormalizedCommandEntry) => NormalizedCommandEntry,
      ) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentCommands: CommandsMap = currentSettings.commands ?? {};
            const existingEntry = currentCommands[name];
            if (existingEntry === undefined) return;
            const normalized = normalizeCommandEntry(existingEntry);
            const updated = updater(normalized);
            const collapsed = collapseCommandEntry(updated);
            const updatedSettings = {
              ...currentSettings,
              commands: { ...currentCommands, [name]: collapsed },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("Workspace.updateCommandEntry")),

      setCommandEntry: (name: string, entry: NormalizedCommandEntry) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentCommands: CommandsMap = currentSettings.commands ?? {};
            const collapsed = collapseCommandEntry(entry);
            const updatedSettings = {
              ...currentSettings,
              commands: { ...currentCommands, [name]: collapsed },
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
              subagents: { ...currentSubagents, [name]: source },
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

      updateSubagentEntry: (
        name: string,
        updater: (entry: NormalizedSubagentEntry) => NormalizedSubagentEntry,
      ) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentSubagents: SubagentsMap = currentSettings.subagents ?? {};
            const existingEntry = currentSubagents[name];
            if (existingEntry === undefined) return;
            const normalized = normalizeSubagentEntry(existingEntry);
            const updated = updater(normalized);
            const collapsed = collapseSubagentEntry(updated);
            const updatedSettings = {
              ...currentSettings,
              subagents: { ...currentSubagents, [name]: collapsed },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
          }),
        ).pipe(Effect.withSpan("Workspace.updateSubagentEntry")),

      setSubagentEntry: (name: string, entry: NormalizedSubagentEntry) =>
        withMutex(
          Effect.gen(function* () {
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentSubagents: SubagentsMap = currentSettings.subagents ?? {};
            const collapsed = collapseSubagentEntry(entry);
            const updatedSettings = {
              ...currentSettings,
              subagents: { ...currentSubagents, [name]: collapsed },
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
              mcpServers: { ...currentMcpServers, [name]: source },
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
 * When project initialization is needed and `yes=false` and `nonInteractive=false`,
 * CliPrompt service is required for agent selection.
 *
 * @param options - Workspace layer options
 * @returns Layer providing WorkspaceContext
 *
 * @experimental This API is unstable and may change without notice.
 */
export const layer = (options: WorkspaceLayerOptions) => Layer.effect(Workspace, make(options));
