/**
 * Workspace context service for CLI commands.
 *
 * This is the sole public gateway for all settings and lockfile read/write
 * operations. It calls the I/O functions (`readSettings`, `writeSettings`,
 * `readLockfile`, `writeLockfile`) directly and manages mutation
 * serialization via a single Semaphore(1). No other service should perform
 * settings or lockfile I/O in production; the per-service semaphores in
 * `settings/service.ts` and `lockfile/service.ts` have been removed.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import { type AgentDescriptor, detectAgents, getAllAgents, getAgentById } from "../agents/index.js";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  LOCKFILE_NAME,
  readLockfile,
  writeLockfile,
  type SkillLockEntry,
  type SkillsLockMap,
} from "../lockfile/index.js";
import { AgentIdSchema } from "../extensions/common.js";
import { type CliError, makeCliError } from "../cli-error/index.js";
import {
  createDefaultSettings,
  DEFAULT_SCOPE,
  readSettings,
  SETTINGS_FILENAME,
  type Settings,
  type SkillsMap,
  type SourceConfig,
  writeSettings,
} from "../settings/index.js";
import { getAxmDir } from "./paths.js";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Confirm, Log, Multiselect } from "../tui/index.js";
import { PromptCancelled } from "../tui/index.js";
import type { Operation, Plan } from "./plan.js";
import { displayPlan } from "./display-plan.js";
import { applyPlan, type ExecutionContext, type Handlers } from "./apply-plan.js";

/**
 * Built-in source defaults that are always available unless overridden.
 *
 * @internal
 */
const BUILT_IN_SOURCES: ReadonlyArray<SourceConfig> = [
  { name: "github", type: "github", url: new URL("https://github.com") },
  { name: "gitlab", type: "gitlab", url: new URL("https://gitlab.com") },
  { name: "bitbucket", type: "bitbucket", url: new URL("https://bitbucket.org") },
];

/**
 * Effect service tag for workspace context.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class Workspace extends Context.Tag("@axm.sh/cli/Workspace")<
  Workspace,
  WorkspaceContextService
>() {
  /**
   * Create a layer from a custom service implementation.
   */
  static readonly layer = (service: WorkspaceContextService): Layer.Layer<Workspace> =>
    Layer.succeed(Workspace, service);
}

/**
 * Error loading workspace context.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type WorkspaceContextError = CliError | PromptCancelled;

/**
 * Options for creating workspace context.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface WorkspaceContextOptions {
  /** Whether to use global workspace (~/.axm) or local (.axm) */
  readonly global: boolean;
  /** Auto-accept detected agents without prompting */
  readonly yes: boolean;
  /** Disable all prompts; Option.none() falls back to CI detection */
  readonly nonInteractive: Option.Option<boolean>;
  /** Show plan without applying (preview mode) */
  readonly preview: boolean;
  /** Explicit agent IDs to use (overrides detection and prompting) */
  readonly agents: Option.Option<readonly string[]>;
}

/**
 * Initialize project workspace by detecting and selecting agents.
 *
 * @param localDir - Path to local .axm directory
 * @param options - Workspace context options
 * @returns Effect yielding selected agent IDs
 *
 * @internal
 */
const initializeProjectWorkspace = (localDir: string, options: WorkspaceContextOptions) =>
  Effect.gen(function* () {
    // Select agents based on options
    let selectedAgents: AgentDescriptor[];

    // If explicit agents are provided, use those (no detection needed)
    if (Option.isSome(options.agents) && options.agents.value.length > 0) {
      selectedAgents = Array.filterMap([...options.agents.value], (id) => getAgentById(id));
    } else {
      // Detect installed agents
      const detectedAgents = yield* detectAgents(process.cwd()).pipe(
        Effect.mapError((error) =>
          makeCliError({
            code: "WORKSPACE_INITIALIZATION_FAILED",
            what: `Failed to detect agents: ${error.message}`,
            cause: error,
          }),
        ),
      );

      if (options.yes) {
        // Auto-select all detected agents
        selectedAgents = detectedAgents;
      } else if (Option.getOrElse(options.nonInteractive, () => process.env["CI"] === "true")) {
        // Non-interactive mode but would need selection - fail with error
        return yield* Effect.fail(
          makeCliError({
            code: "WORKSPACE_INITIALIZATION_FAILED",
            what: "Cannot initialize workspace in non-interactive mode",
            howToFix: "Use --yes to auto-select detected agents, or run interactively",
          }),
        );
      } else {
        // Interactive mode — single multiselect with detected agents pre-selected
        const multiselect = yield* Multiselect;
        const allAgents = getAllAgents();
        const detectedIds = Array.map(detectedAgents, (a) => a.id);

        selectedAgents = yield* multiselect
          .prompt<AgentDescriptor>({
            message: "Select agents to configure",
            items: allAgents,
            toOption: (agent) => ({
              value: agent.id,
              label: agent.name,
              hint: Option.some(`skills: ${agent.skills.dir}`),
            }),
            initialValues: detectedIds.length > 0 ? Option.some(detectedIds) : Option.none(),
            required: Option.some(false),
          })
          .pipe(Effect.map((agents) => [...agents]));
      }
    }

    // Extract agent IDs for settings
    const agentIds = Array.map(selectedAgents, (a) => a.id);

    // Create settings with selected agents (satisfies ensures type safety without cast)
    const settings = { agents: agentIds } satisfies Settings;
    yield* writeSettings(localDir, settings);

    // Create empty lockfile
    yield* writeLockfile(localDir, { lockfileVersion: 1, skills: {} });

    return settings;
  });

/**
 * Ensure global workspace directory has settings.json and axm-lock.yaml.
 *
 * Creates missing files with empty defaults.
 *
 * @param globalDir - Path to global .axm directory
 *
 * @internal
 */
const ensureGlobalWorkspaceInitialized = (globalDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const settingsPath = path.join(globalDir, SETTINGS_FILENAME);
    const lockfilePath = path.join(globalDir, LOCKFILE_NAME);

    const settingsExists = yield* fs.exists(settingsPath).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "SETTINGS_PARSE_FAILED",
          what: `Failed to check if settings file exists: ${settingsPath}`,
          cause: error,
        }),
      ),
    );
    const lockfileExists = yield* fs.exists(lockfilePath).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "LOCKFILE_PARSE_FAILED",
          what: `Failed to check if lockfile exists: ${lockfilePath}`,
          cause: error,
        }),
      ),
    );

    // Create settings.json with {} if missing
    if (!settingsExists) {
      yield* writeSettings(globalDir, {});
    }

    // Create axm-lock.yaml with version 1, empty skills if missing
    if (!lockfileExists) {
      yield* writeLockfile(globalDir, { lockfileVersion: 1, skills: {} });
    }
  });

/**
 * Ensure project workspace is initialized, returning local settings.
 *
 * Reads existing local settings or runs the initialization flow when missing.
 *
 * @param localDir - Path to local .axm directory
 * @param options - Workspace context options
 * @returns Effect yielding local Settings
 *
 * @internal
 */
const ensureProjectWorkspaceInitialized = (localDir: string, options: WorkspaceContextOptions) =>
  Effect.gen(function* () {
    const localSettingsResult = yield* readSettings(localDir).pipe(
      Effect.map(
        Option.match({
          onNone: () => ({ found: false as const, settings: createDefaultSettings() }),
          onSome: (s) => ({ found: true as const, settings: s }),
        }),
      ),
    );

    if (!localSettingsResult.found) {
      // Initialize project workspace and return the settings it wrote
      return yield* initializeProjectWorkspace(localDir, options);
    }

    return localSettingsResult.settings;
  });

/**
 * Create workspace context effect.
 *
 * Loads settings and lockfile based on workspace scope:
 * - Global mode: reads only global settings (auto-creates with {} if not found)
 * - Local mode: merges global and local settings (local overrides global),
 *   runs initialization flow if local settings don't exist
 *
 * When project initialization is needed and `yes=false` and `nonInteractive=false`,
 * TUI services are required for agent selection prompts.
 *
 * @param options - Workspace context options
 * @returns Effect yielding WorkspaceContextService
 *
 * @internal Not exported from barrel - use layer() for external access
 */
const make = (options: WorkspaceContextOptions) =>
  Effect.gen(function* () {
    const globalDir = yield* getAxmDir(true);
    const localDir = yield* getAxmDir(false);
    const workspaceDir = options.global ? globalDir : localDir;

    if (options.global) {
      yield* ensureGlobalWorkspaceInitialized(globalDir);
    } else {
      yield* ensureProjectWorkspaceInitialized(localDir, options);
    }

    const resolvedNonInteractive = Option.getOrElse(
      options.nonInteractive,
      () => process.env["CI"] === "true",
    );

    // Capture FileSystem and Path for use in closures
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const semaphore = yield* Effect.makeSemaphore(1);

    const fsLayer = Layer.merge(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );

    // Mutable cache for merged sources (invalidated by addConfiguredSource)
    let cachedSources: ReadonlyArray<SourceConfig> | null = null;

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
     * Three-layer merge: project sources -> global sources -> built-in sources.
     * Name-based deduplication: earlier layers win.
     */
    const getConfiguredSources = (): Effect.Effect<ReadonlyArray<SourceConfig>, CliError> =>
      Effect.gen(function* () {
        if (cachedSources !== null) return cachedSources;

        const projectSettings = yield* readSettingsSafe(localDir);
        const globalSettings = yield* readSettingsSafe(globalDir);

        const projectSources: ReadonlyArray<SourceConfig> = projectSettings.sources ?? [];
        const globalSources: ReadonlyArray<SourceConfig> = globalSettings.sources ?? [];

        const projectNames = new Set(projectSources.map((s) => s.name));
        const filteredGlobal = globalSources.filter((s) => !projectNames.has(s.name));
        const projectGlobalNames = new Set([...projectNames, ...filteredGlobal.map((s) => s.name)]);

        const merged: ReadonlyArray<SourceConfig> = [
          ...projectSources,
          ...filteredGlobal,
          ...BUILT_IN_SOURCES.filter((s) => !projectGlobalNames.has(s.name)),
        ];

        cachedSources = merged;
        return merged;
      });

    return {
      global: options.global,
      path: workspaceDir,
      nonInteractive: resolvedNonInteractive,
      preview: options.preview,
      resolvePlan: <Op extends Operation<string, unknown>, T extends Handlers<Op>>(
        plan: Plan<Op>,
        handlers: T,
      ) =>
        Effect.gen(function* () {
          const log = yield* Log;
          if (options.preview) {
            yield* log.info("Previewing changes...");
            yield* displayPlan(plan);
            if (options.yes) {
              yield* log.info("Pre-approved via --yes, applying changes...");
              return yield* applyPlan(plan, handlers);
            } else if (resolvedNonInteractive) {
              yield* log.warn(
                "Cannot prompt in non-interactive mode. Use --yes to apply, or remove --preview.",
              );
              return { ...plan, jobs: [] } satisfies Plan<Op>;
            } else {
              const confirm = yield* Confirm;
              const confirmed = yield* confirm.prompt({ message: "Apply changes?" });
              if (!confirmed) {
                yield* log.success("Cancelled.");
                return { ...plan, jobs: [] } satisfies Plan<Op>;
              }
              return yield* applyPlan(plan, handlers);
            }
          } else {
            const applied = yield* applyPlan(plan, handlers);
            yield* displayPlan(applied);
            return applied;
          }
        }),

      getConfiguredSources,

      getConfiguredSourceByName: (name: string) =>
        getConfiguredSources().pipe(
          Effect.map((sources) => Option.fromNullable(sources.find((s) => s.name === name))),
        ),

      getConfiguredRegistrySources: (scope: Option.Option<string>) =>
        getConfiguredSources().pipe(
          Effect.map((sources) => {
            const registrySources = sources.filter(
              (s): s is Extract<SourceConfig, { type: "registry" }> => s.type === "registry",
            );
            if (Option.isNone(scope)) return registrySources;
            const scopeValue = scope.value;
            const scopeMatched = registrySources.filter(
              (s) => s.scopes !== undefined && s.scopes.includes(scopeValue),
            );
            if (scopeMatched.length > 0) return scopeMatched;
            return registrySources.filter((s) => s.scopes === undefined);
          }),
        ),

      getConfiguredScope: () =>
        Effect.gen(function* () {
          const normalizeScope = (s: string): string => (s.startsWith("@") ? s : `@${s}`);
          const projectSettings = yield* readSettingsSafe(localDir);
          if (projectSettings.scope) return normalizeScope(projectSettings.scope);
          const globalSettings = yield* readSettingsSafe(globalDir);
          if (globalSettings.scope) return normalizeScope(globalSettings.scope);
          return DEFAULT_SCOPE;
        }),

      addConfiguredSource: (source: SourceConfig) =>
        withMutex(
          Effect.gen(function* () {
            const current = yield* readSettingsSafe(workspaceDir);
            const currentSources: ReadonlyArray<SourceConfig> = current.sources ?? [];
            const updatedSettings = { ...current, sources: [...currentSources, source] };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));
            cachedSources = null; // invalidate cache
          }),
        ),

      getInstalledSkills: () =>
        readSettingsSafe(workspaceDir).pipe(
          Effect.map((s) => s.skills ?? ({} satisfies SkillsMap)),
        ),

      getConfiguredAgents: () =>
        readSettingsSafe(workspaceDir).pipe(Effect.map((s) => s.agents ?? [])),

      getLockedSkills: () => readLockfileSafe(workspaceDir).pipe(Effect.map((lf) => lf.skills)),

      getLockedSkill: (name: string) =>
        readLockfileSafe(workspaceDir).pipe(
          Effect.map((lf) => Option.fromNullable(lf.skills[name])),
        ),

      setSkill: (name: string, source: string, lockEntry: SkillLockEntry) =>
        withMutex(
          Effect.gen(function* () {
            // Update settings
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
        ),

      removeSkill: (name: string) =>
        withMutex(
          Effect.gen(function* () {
            // Update settings
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentSkills: SkillsMap = currentSettings.skills ?? {};
            if (!(name in currentSkills)) return; // no-op

            const { [name]: _, ...remainingSkills } = currentSkills;
            void _;
            const updatedSettings = { ...currentSettings, skills: remainingSkills };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));

            // Update lockfile
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            if (name in currentLockfile.skills) {
              const { [name]: __, ...remainingLockSkills } = currentLockfile.skills;
              void __;
              const updatedLockfile = { ...currentLockfile, skills: remainingLockSkills };
              yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
            }
          }),
        ),

      addConfiguredAgent: (agentId: string) =>
        withMutex(
          Effect.gen(function* () {
            const validId = yield* Schema.decodeUnknown(AgentIdSchema)(agentId).pipe(
              Effect.mapError((error) =>
                makeCliError({
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
    };
  });

/**
 * Create a layer that loads workspace context from disk.
 *
 * When project initialization is needed and `yes=false` and `nonInteractive=false`,
 * TUI services are required for agent selection prompts.
 *
 * @param options - Workspace context options
 * @returns Layer providing WorkspaceContext
 *
 * @experimental This API is unstable and may change without notice.
 */
export const layer = (options: WorkspaceContextOptions) => Layer.effect(Workspace, make(options));

/**
 * Workspace context service types.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

/**
 * Service interface for workspace context.
 *
 * Provides access to parsed workspace settings and lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface WorkspaceContextService {
  /** Whether this is a global workspace (~/.axm) or local (.axm) */
  readonly global: boolean;
  /** Path to the .axm directory */
  readonly path: string;
  /** Resolved nonInteractive flag (explicit value or CI detection fallback) */
  readonly nonInteractive: boolean;
  /** Whether to show plan without applying (preview mode) */
  readonly preview: boolean;
  /** Display, confirm, and apply a plan based on preview/yes/nonInteractive flags. */
  readonly resolvePlan: <Op extends Operation<string, unknown>, T extends Handlers<Op>>(
    plan: Plan<Op>,
    handlers: T,
  ) => Effect.Effect<Plan<Op>, PromptCancelled | CliError, Log | Confirm | ExecutionContext<T>>;
  /** Merged sources from project, global, and built-in defaults. Cached per workspace lifetime. */
  readonly getConfiguredSources: () => Effect.Effect<ReadonlyArray<SourceConfig>, CliError>;
  /** Lookup a source by name from the merged sources list. */
  readonly getConfiguredSourceByName: (
    name: string,
  ) => Effect.Effect<Option.Option<SourceConfig>, CliError>;
  /** Filter merged sources to registry sources, optionally filtered by scope. */
  readonly getConfiguredRegistrySources: (
    scope: Option.Option<string>,
  ) => Effect.Effect<ReadonlyArray<Extract<SourceConfig, { type: "registry" }>>, CliError>;
  /** Resolve scope: project settings -> global settings -> DEFAULT_SCOPE. */
  readonly getConfiguredScope: () => Effect.Effect<string, CliError>;
  /** Append a source to project settings. Invalidates the sources cache. Serialized by semaphore. */
  readonly addConfiguredSource: (source: SourceConfig) => Effect.Effect<void, CliError>;
  /** Read settings and return the skills map, defaulting to `{}`. */
  readonly getInstalledSkills: () => Effect.Effect<SkillsMap, CliError>;
  /** Read settings and return the configured agent IDs, defaulting to `[]`. */
  readonly getConfiguredAgents: () => Effect.Effect<ReadonlyArray<string>, CliError>;
  /** Read lockfile and return the skills lock map. */
  readonly getLockedSkills: () => Effect.Effect<SkillsLockMap, CliError>;
  /** Read lockfile and return the entry for a specific skill, or Option.none(). */
  readonly getLockedSkill: (name: string) => Effect.Effect<Option.Option<SkillLockEntry>, CliError>;
  /** Add or update a skill in both settings and lockfile. Sets updatedAt. Serialized by semaphore. */
  readonly setSkill: (
    name: string,
    source: string,
    lockEntry: SkillLockEntry,
  ) => Effect.Effect<void, CliError>;
  /** Remove a skill from both settings and lockfile. No-op if absent. Serialized by semaphore. */
  readonly removeSkill: (name: string) => Effect.Effect<void, CliError>;
  /** Append an agent ID if not already present and write to disk. Fails with CliError if invalid. Serialized by semaphore. */
  readonly addConfiguredAgent: (agentId: string) => Effect.Effect<void, CliError>;
}
