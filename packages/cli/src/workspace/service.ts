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
 * Supporting logic is split into focused modules:
 * - `taxonomy-types.ts` — classifier-backed type definitions
 * - `source-metadata.ts` — source metadata derivation helpers
 * - `builtin-packs.ts` — builtin pack materialization
 * - `initialization.ts` — workspace initialization (agent detection, settings creation)
 * - `classifier-records.ts` — classifier row → record map converters
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { getAgentById } from "../agents/index.js";
import { CliFlags } from "../cli-flags/index.js";
import { CliEnvConfig } from "../config/index.js";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import {
  LOCKFILE_NAME,
  readLockfile,
  writeLockfile,
  type CommandLockEntry,
  type CommandsLockMap,
  type McpServerLockEntry,
  type McpServersLockMap,
  type PackLockEntry,
  type PacksLockMap,
  type RegistryPackLockEntry,
  type SkillLockEntry,
  type SkillsLockMap,
} from "../lockfile/index.js";
import {
  computeSkillPaths,
  type SkillDirPaths,
  type SkillPathSource,
} from "../extensions/skills/paths.js";
import { computePackPaths, type PackDirPath } from "../extensions/packs/paths.js";
import { sanitizeName } from "../extensions/skills/utils.js";
import { AgentIdSchema, formatFqn } from "../extensions/index.js";
import { type AppError, makeAppError } from "../app-error/index.js";
import {
  collapseSkillEntry,
  createDefaultSettings,
  DEFAULT_PROFILE,
  getSkillEntrySource,
  type NonSkillExtensionsMap,
  type NormalizedSkillEntry,
  normalizeSkillEntry,
  type PacksMap,
  readSettings,
  type Settings,
  type SkillsMap,
  type SourceHostConfig,
  writeSettings,
} from "../settings/index.js";
import { lockEntryToSourceParams, parseInputPattern, printSourceParams } from "../sources/index.js";
import * as Record from "effect/Record";
import { getAxmDir } from "./paths.js";
import { isUserScope, type WorkspaceScope } from "./scope.js";
import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Output } from "../output/index.js";
import { Input } from "../input/index.js";
import { PromptCancelled } from "../prompt-cancelled.js";
import { resolveDiagnosticVerbosity } from "../runtime/error-handling.js";
import type { ExecutedPlan, JobStepResult, Plan, PlannedJobStep } from "./plan.js";
import type { OperationResult } from "./plan.js";
import { displayPlan } from "./display-plan.js";
import { applyPlan } from "./apply-plan.js";
/** Lockfile health state used for reconciliation decisions. */
export type LockfileState = "ok" | "missing" | "invalid";
import { runReadRecoverOperation, runReconcileMaterializeOperation } from "./reconciliation.js";
import type { ReconciliationContext } from "./reconciliation-types.js";
import { classifyExtensions } from "./classifier.js";
import { discoverSkillsInDir } from "../cli-commands/skills/install/discover-skills.js";
// Extracted modules
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
} from "./classifier-records.js";

/**
 * Arguments for `setSkill` — bundles the skill name (map key) with the lock entry.
 * The name may diverge from any registry extension name.
 */
export interface SetSkillArgs {
  readonly name: string;
  readonly lockEntry: SkillLockEntry;
  /** Version constraint from the original source (e.g. "^1.0.0"). Preserved in settings, not in lockfile. */
  readonly versionConstraint: Option.Option<string>;
}

/**
 * Arguments for `setPack` — all `PackLockEntry` fields except `type` (always "registry"),
 * plus an optional version constraint for settings persistence.
 */
export type SetPackArgs = Omit<RegistryPackLockEntry, "type"> & {
  /** Version constraint from the original source (e.g. "^2.0.0"). Preserved in settings, not in lockfile. */
  readonly versionConstraint: Option.Option<string>;
};

/**
 * Arguments for `setCommand` — bundles the command name with the lock entry.
 */
export interface SetCommandArgs {
  readonly name: string;
  readonly lockEntry: CommandLockEntry;
}

/**
 * Arguments for `setMcpServer` — bundles the MCP server name with the lock entry.
 */
export interface SetMcpServerArgs {
  readonly name: string;
  readonly lockEntry: McpServerLockEntry;
}

// ---------------------------------------------------------------------------
// Taxonomy types (re-exported from taxonomy-types.ts)
// ---------------------------------------------------------------------------

export type {
  ClassifiedCommand,
  ClassifiedExtensionRef,
  ClassifiedSkill,
  ConfiguredCommand,
  ConfiguredExtensionRef,
  ConfiguredSkill,
  ImplicitCommand,
  ImplicitExtensionRef,
  ImplicitSkill,
  InstalledCommand,
  InstalledExtensionRef,
  InstalledSkill,
  UnmanagedCommand,
  UnmanagedExtensionRef,
  UnmanagedSkill,
} from "./taxonomy-types.js";

import type {
  ClassifiedCommand,
  ClassifiedExtensionRef,
  ClassifiedSkill,
  ConfiguredCommand,
  ConfiguredExtensionRef,
  ConfiguredSkill,
  ImplicitCommand,
  ImplicitExtensionRef,
  ImplicitSkill,
  InstalledCommand,
  InstalledExtensionRef,
  InstalledSkill,
  UnmanagedCommand,
  UnmanagedExtensionRef,
  UnmanagedSkill,
} from "./taxonomy-types.js";

/**
 * Augment a plan with lockfile reconciliation steps when the lockfile is
 * missing or invalid. Returns the plan unchanged when lockfile is ok.
 */
const augmentPlanWithReconciliation = (
  plan: Plan,
  getLockfileState: () => Effect.Effect<LockfileState, AppError>,
  output: ServiceMap.Service.Shape<typeof Output>,
  baseDir: string,
  workspaceDir: string,
  readSettingsSafe: (dir: string) => Effect.Effect<Settings, AppError>,
  fsLayer: Layer.Layer<FileSystem.FileSystem | Path.Path>,
): Effect.Effect<Plan, AppError> =>
  Effect.gen(function* () {
    const lockfileState = yield* getLockfileState();

    if (lockfileState === "ok") {
      return plan;
    }

    if (lockfileState === "invalid") {
      yield* output.warn("LOCKFILE_INVALID_RECONCILE");
    }

    const reason = lockfileState as "missing" | "invalid";
    const settings = yield* readSettingsSafe(workspaceDir);
    const reconciliationContext: ReconciliationContext = {
      baseDir,
      now: new Date(),
      defaultProfile: settings.profile ?? DEFAULT_PROFILE,
      agents: settings.agents ?? [],
      settings,
    };

    const toJobStepResult = (result: OperationResult): JobStepResult =>
      result.result === "error"
        ? { result: "error", message: result.message, error: result.error }
        : { result: "success", message: result.message };

    const readRecoverStep: PlannedJobStep = {
      readiness: "ready",
      label: `Recover lockfile (${reason})`,
      run: runReadRecoverOperation(reconciliationContext).pipe(
        Effect.map(toJobStepResult),
        Effect.provide(fsLayer),
      ),
    };

    const materializeStep: PlannedJobStep = {
      readiness: "ready",
      label: `Reconcile lockfile (${reason})`,
      run: runReconcileMaterializeOperation(reconciliationContext, workspaceDir, reason, {
        allowMissingDeclarations: true,
      }).pipe(Effect.map(toJobStepResult), Effect.provide(fsLayer)),
    };

    return {
      ...plan,
      jobs: [
        {
          concurrency: 1 as const,
          steps: [readRecoverStep, materializeStep],
        },
        ...plan.jobs,
      ],
    };
  });

/**
 * Effect service tag for workspace context.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class Workspace extends ServiceMap.Service<Workspace, WorkspaceContextService>()(
  "@axm.sh/cli/Workspace",
) {
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
export type WorkspaceContextError = AppError | PromptCancelled;

/**
 * Options for creating workspace context.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface WorkspaceContextOptions {
  /** Whether to use user-scope workspace (~/.axm) or project workspace (.axm) */
  readonly scope: WorkspaceScope;
  /** Explicit agent IDs to use (overrides detection and prompting) */
  readonly agents: Option.Option<readonly string[]>;
  /** Built-in source host configs (defaults to git forges only when not provided) */
  readonly builtInSources?: ReadonlyArray<SourceHostConfig>;
}

/**
 * Create workspace context effect.
 *
 * Loads settings and lockfile based on workspace profile:
 * - User-scope mode: reads only user-scope settings (auto-creates with {} if not found)
 * - Project mode: merges user-scope and project settings (project overrides user),
 *   runs initialization flow if local settings don't exist
 *
 * When project initialization is needed and `yes=false` and `nonInteractive=false`,
 * Input service is required for agent selection.
 *
 * @param options - Workspace context options
 * @returns Effect yielding WorkspaceContextService
 *
 * @internal Not exported from barrel - use layer() for external access
 */
const make = (options: WorkspaceContextOptions) =>
  Effect.gen(function* () {
    const globalDir = yield* getAxmDir("user");
    const localDir = yield* getAxmDir("project");
    const workspaceDir = isUserScope(options.scope) ? globalDir : localDir;

    if (isUserScope(options.scope)) {
      yield* ensureGlobalWorkspaceInitialized(globalDir);
    } else {
      yield* ensureProjectWorkspaceInitialized(localDir, options);
    }

    // Capture FileSystem and Path for use in closures
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const envConfig = yield* CliEnvConfig;
    const output = yield* Output;
    const input = yield* Input;
    const semaphore = yield* Semaphore.make(1);

    const baseDir = path.dirname(workspaceDir);

    const fsLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
      Layer.succeed(CliEnvConfig, envConfig),
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
    const getClassifiedExtensions = (type: import("../extensions/index.js").ExtensionType) =>
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
              sourceMetaByName: deriveSourceMetaForSkills(
                settings,
                lockfile.skills as Record<string, { type: string }>,
                detectedNames,
              ),
            });
          }
          case "command": {
            const commandSettings = settings.commands ?? {};
            const configured = Object.fromEntries(
              Object.entries(commandSettings).map(([name, source]) => [
                name,
                { source, enabled: true },
              ]),
            );
            return yield* classifyExtensions({
              type,
              configured,
              lockedNames: Object.keys(lockfile.commands ?? {}),
              detectedNames: [],
              ignoredPatterns: settings.ignored?.commands ?? [],
              sourceMetaByName: deriveSourceMetaForNonSkill(
                commandSettings,
                (lockfile.commands ?? {}) as Record<string, { type: string }>,
              ),
            });
          }
          case "mcp-server": {
            const mcpSettings = settings.mcpServers ?? {};
            const configured = Object.fromEntries(
              Object.entries(mcpSettings).map(([name, source]) => [name, { source }]),
            );
            return yield* classifyExtensions({
              type,
              configured,
              lockedNames: Object.keys(lockfile.mcpServers ?? {}),
              detectedNames: [],
              ignoredPatterns: settings.ignored?.mcpServers ?? [],
              sourceMetaByName: deriveSourceMetaForNonSkill(
                mcpSettings,
                (lockfile.mcpServers ?? {}) as Record<string, { type: string }>,
              ),
            });
          }
          case "pack": {
            const packSettings = settings.packs ?? {};
            const configured = Object.fromEntries(
              Object.entries(packSettings).map(([name, entry]) => {
                const source = typeof entry === "string" ? entry : entry.source;
                return [name, { source }];
              }),
            );
            return yield* classifyExtensions({
              type,
              configured,
              lockedNames: Object.keys(lockfile.packs ?? {}),
              detectedNames: [],
              ignoredPatterns: settings.ignored?.packs ?? [],
              sourceMetaByName: deriveSourceMetaForPacks(
                packSettings,
                (lockfile.packs ?? {}) as Record<string, { type: string }>,
              ),
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
          if (sourceStr !== undefined) {
            const parts = sourceStr.split(":");
            if (parts.length >= 2 && parts[0] === "registry") {
              const parsed = parseInputPattern(parts.slice(1).join(":"));
              if (
                Option.isSome(parsed) &&
                parsed.value.pattern.pattern === "registry-pattern-input"
              ) {
                if (Option.isSome(parsed.value.pattern.name)) {
                  return parsed.value.pattern.name.value;
                }
              }
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
      resolvePlan: Effect.fn("Workspace.resolvePlan")(function* (plan: Plan) {
        const flags = yield* CliFlags;
        const resolvedYes = flags.yes || flags.nonInteractive;
        const envConfig = yield* CliEnvConfig;
        const verbosity = resolveDiagnosticVerbosity(process.argv, {
          AXM_VERBOSE: Option.getOrUndefined(envConfig.verbose),
          AXM_DEBUG: Option.getOrUndefined(envConfig.debug),
        });
        const showPlan = (targetPlan: Plan | ExecutedPlan) =>
          displayPlan(targetPlan, { verbosity }).pipe(
            Effect.provide(Layer.succeed(Output, output)),
          );

        // Lockfile reconciliation: detect missing/invalid lockfile and prepend recovery steps
        const augmentedPlan = yield* augmentPlanWithReconciliation(
          plan,
          getLockfileState,
          output,
          baseDir,
          workspaceDir,
          readSettingsSafe,
          fsLayer,
        );

        // Scan readiness across all planned steps
        const allSteps = Array.flatMap(augmentedPlan.jobs, (job) => [...job.steps]);
        const hasErrors = allSteps.some((s) => s.readiness === "error");
        const hasWarns = allSteps.some((s) => s.readiness === "warn");

        // Aggregate error messages for the AppError detail
        const errorMessages = allSteps
          .filter((s) => s.readiness === "error")
          .map((s) => `${s.label}: ${s.errorMessage}`);

        // Block entire plan when any step has error readiness (unless --force)
        if (hasErrors) {
          if (flags.force) {
            // --force: downgrade errors to warnings and proceed
            yield* Effect.forEach(errorMessages, (msg) => output.warn(msg));
          } else {
            yield* showPlan(augmentedPlan);
            return yield* makeAppError({
              code: "PLAN_BLOCKED_BY_ERRORS",
              what: "Plan has errors that prevent execution",
              details: errorMessages,
              howToFix: "Re-run with --force to override",
            });
          }
        }

        // Warnings are displayed but never block execution
        if (hasWarns) {
          const warnMessages = allSteps
            .filter((s) => s.readiness === "warn")
            .map((s) => `${s.label}: ${s.warnMessage}`);
          yield* Effect.forEach(warnMessages, (msg) => output.warn(msg));
        }

        if (flags.preview) {
          yield* output.info("Previewing changes...");
          yield* showPlan(augmentedPlan);

          // In non-interactive mode without explicit --yes, preview is display-only (dry-run)
          if (flags.nonInteractive && !flags.yes) {
            return {
              _tag: "ExecutedPlan",
              name: augmentedPlan.name,
              description: augmentedPlan.description,
              jobs: [],
            } satisfies ExecutedPlan;
          }

          if (!resolvedYes) {
            const confirmed = yield* input.confirm({ message: "Apply changes?" });
            if (!confirmed) {
              yield* output.success("Cancelled.");
              return {
                _tag: "ExecutedPlan",
                name: augmentedPlan.name,
                description: augmentedPlan.description,
                jobs: [],
              } satisfies ExecutedPlan;
            }
          }
        }

        const executed = yield* applyPlan(augmentedPlan);
        yield* showPlan(executed);
        return executed;
      }),

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
          const normalizeProfile = (s: string): string => (s.startsWith("@") ? s : `@${s}`);
          const projectSettings = yield* readSettingsSafe(localDir);
          if (projectSettings.profile) return normalizeProfile(projectSettings.profile);
          const globalSettings = yield* readSettingsSafe(globalDir);
          if (globalSettings.profile) return normalizeProfile(globalSettings.profile);
          return DEFAULT_PROFILE;
        }),

      // TODO: check logged-in identity handle when auth is implemented
      getDefaultProfile: () =>
        Effect.gen(function* () {
          const normalizeProfile = (s: string): string => (s.startsWith("@") ? s : `@${s}`);
          const projectSettings = yield* readSettingsSafe(localDir);
          if (projectSettings.profile)
            return Option.some(normalizeProfile(projectSettings.profile));
          const globalSettings = yield* readSettingsSafe(globalDir);
          if (globalSettings.profile) return Option.some(normalizeProfile(globalSettings.profile));
          return Option.none<string>();
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
          Effect.map((s) => (s.ignored?.skills ?? []) as ReadonlyArray<string>),
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
              ? { refType: "registry", profile: entry.profile }
              : entry.type === "local"
                ? { refType: "local" }
                : entry.type === "builtin"
                  ? { refType: "builtin" }
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
                    const fqn = formatFqn({ handle: lockEntry.profile, type: "skills", name });
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
            if (!(name in currentSkills)) {
              return yield* makeAppError({
                code: "SKILL_NOT_FOUND",
                what: `Skill "${name}" not found in settings`,
              });
            }
            const normalized = normalizeSkillEntry(currentSkills[name]!);
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
            if (!(oldName in currentSkills)) {
              return yield* makeAppError({
                code: "SKILL_NOT_FOUND",
                what: `Skill "${oldName}" not found in settings`,
              });
            }

            // Rename in settings
            const oldEntry = currentSkills[oldName]!;
            const { [oldName]: _, ...remainingSkills } = currentSkills;
            void _;
            const updatedSettings = {
              ...currentSettings,
              skills: { ...remainingSkills, [newName]: oldEntry },
            };
            yield* writeSettings(workspaceDir, updatedSettings).pipe(Effect.provide(fsLayer));

            // Rename in lockfile if entry exists
            const currentLockfile = yield* readLockfileSafe(workspaceDir);
            if (oldName in currentLockfile.skills) {
              const oldLockEntry = currentLockfile.skills[oldName]!;
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
            if (!(name in currentLockfile.skills)) {
              return yield* makeAppError({
                code: "LOCK_ENTRY_NOT_FOUND",
                what: `Lock entry "${name}" not found in lockfile`,
              });
            }
            const oldEntry = currentLockfile.skills[name]!;
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
          Effect.map((s) => (s.ignored?.commands ?? []) as ReadonlyArray<string>),
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
          Effect.map((s) => (s.ignored?.mcpServers ?? []) as ReadonlyArray<string>),
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
          Effect.map((s) => (s.ignored?.packs ?? []) as ReadonlyArray<string>),
        ),

      getLockedPacks: () => readLockfileSafe(workspaceDir).pipe(Effect.map((lf) => lf.packs ?? {})),

      getLockedPack: (name: string) =>
        readLockfileSafe(workspaceDir).pipe(
          Effect.map((lf) => Option.fromUndefinedOr((lf.packs ?? {})[name])),
        ),

      setPack: (args: SetPackArgs) =>
        withMutex(
          Effect.gen(function* () {
            const { name, versionConstraint, ...lockFields } = args;
            const lockEntry: RegistryPackLockEntry = { ...lockFields, name, type: "registry" };
            // Update settings — thread versionConstraint through so it's preserved
            const fqn = formatFqn({ handle: args.profile, type: "packs", name });
            const source = Option.isSome(versionConstraint)
              ? `${fqn}@${versionConstraint.value}`
              : fqn;
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentPacks: PacksMap = currentSettings.packs ?? {};
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
        ).pipe(Effect.withSpan("Workspace.setPack")),

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
              yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
            }
          }),
        ).pipe(Effect.withSpan("Workspace.removePack")),

      getPackDir: (name: string, profile: string) =>
        Effect.succeed(computePackPaths(path.join, baseDir, profile, name)),

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
            // Assertion needed: CommandLockEntry is structurally compatible with SkillLockEntry
            // for lockEntryToSourceParams (only accesses source-type fields, not agents)
            const sourceInput = lockEntryToSourceParams(lockEntry as unknown as SkillLockEntry);
            const source = printSourceParams(sourceInput);
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentCommands: NonSkillExtensionsMap = currentSettings.commands ?? {};
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
            const currentCommands: NonSkillExtensionsMap = currentSettings.commands ?? {};
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
            // Assertion needed: McpServerLockEntry is structurally compatible with SkillLockEntry
            // for lockEntryToSourceParams (only accesses source-type fields, not agents)
            const sourceInput = lockEntryToSourceParams(lockEntry as unknown as SkillLockEntry);
            const source = printSourceParams(sourceInput);
            const currentSettings = yield* readSettingsSafe(workspaceDir);
            const currentMcpServers: NonSkillExtensionsMap = currentSettings.mcpServers ?? {};
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
            const currentMcpServers: NonSkillExtensionsMap = currentSettings.mcpServers ?? {};
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
            const currentCommands: NonSkillExtensionsMap = currentSettings.commands ?? {};
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
            const currentMcpServers: NonSkillExtensionsMap = currentSettings.mcpServers ?? {};
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
            yield* writeLockfile(workspaceDir, updatedLockfile).pipe(Effect.provide(fsLayer));
          }),
        ),

      // -----------------------------------------------------------------------
      // Pack dependency queries
      // -----------------------------------------------------------------------

      isExtensionRequiredByInstalledPack: (
        target: import("../workflows/install-operation/workflow.js").ExtensionTarget,
      ) =>
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
              const parts = fqn.split("/");
              const resolvedName = parts[parts.length - 1];
              if (resolvedName === target.name) return true;
            }
          }

          return false;
        }),

      markDependencyRetainedInLockfile: (
        target: import("../workflows/install-operation/workflow.js").ExtensionTarget,
      ) =>
        withMutex(
          Effect.gen(function* () {
            const currentLockfile = yield* readLockfileSafe(workspaceDir);

            switch (target.type) {
              case "skill": {
                if (!(target.name in currentLockfile.skills)) return;
                const entry = currentLockfile.skills[target.name]!;
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
                if (!(target.name in commands)) return;
                const entry = commands[target.name]!;
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
                if (!(target.name in mcpServers)) return;
                const entry = mcpServers[target.name]!;
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
 * Input service is required for agent selection.
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
  /** Whether this is a user-scope workspace (~/.axm) or project workspace (.axm) */
  readonly scope: WorkspaceScope;
  /** Path to the .axm directory */
  readonly path: string;
  /** Project root directory (parent of .axm) */
  readonly baseDir: string;
  /** Probe lockfile state for policy decisions: ok | missing | invalid. */
  readonly getLockfileState: () => Effect.Effect<LockfileState, AppError>;
  /** Display, confirm, and apply a plan based on preview/yes/nonInteractive/force flags from CliFlags. */
  readonly resolvePlan: (
    plan: Plan,
  ) => Effect.Effect<ExecutedPlan, PromptCancelled | AppError, CliFlags | CliEnvConfig>;
  /** Merged sources from project, user-scope, and built-in defaults. Cached per workspace lifetime. */
  readonly getConfiguredSources: () => Effect.Effect<ReadonlyArray<SourceHostConfig>, AppError>;
  /** Lookup a source by name from the merged sources list. */
  readonly getConfiguredSourceByName: (
    name: string,
  ) => Effect.Effect<Option.Option<SourceHostConfig>, AppError>;
  /** Filter merged sources to registry sources. */
  readonly getRegistrySourceHosts: () => Effect.Effect<
    ReadonlyArray<Extract<SourceHostConfig, { type: "registry" }>>,
    AppError
  >;
  /** Resolve profile: project settings -> user-scope settings -> DEFAULT_PROFILE. */
  readonly getConfiguredProfile: () => Effect.Effect<string, AppError>;
  /** Resolve profile without fallback: project settings -> user-scope settings -> Option.none(). */
  readonly getDefaultProfile: () => Effect.Effect<Option.Option<string>, AppError>;
  /** Append a source to project settings. Invalidates the sources cache. Serialized by semaphore. */
  readonly addConfiguredSource: (source: SourceHostConfig) => Effect.Effect<void, AppError>;
  /** Configured skills from settings with source metadata. */
  readonly getConfiguredSkills: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredSkill>,
    AppError
  >;
  /** Implicit skills (lockfile-only native entries). */
  readonly getImplicitSkills: () => Effect.Effect<
    Record.ReadonlyRecord<string, ImplicitSkill>,
    AppError
  >;
  /** Unmanaged skills (on-disk only, not configured or implicit). */
  readonly getUnmanagedSkills: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedSkill>,
    AppError
  >;
  /** Installed skills (configured ∪ implicit). */
  readonly getInstalledSkills: () => Effect.Effect<
    Record.ReadonlyRecord<string, InstalledSkill>,
    AppError
  >;
  /** All classified skills. */
  readonly getClassifiedSkills: () => Effect.Effect<
    Record.ReadonlyRecord<string, ClassifiedSkill>,
    AppError
  >;
  /** Configured skills with non-native packaging. */
  readonly getConfiguredExternalSkills: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredSkill>,
    AppError
  >;
  /** Unmanaged skills with non-native packaging. */
  readonly getUnmanagedExternalSkills: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedSkill>,
    AppError
  >;
  /** Ignored skill patterns from settings. */
  readonly getIgnoredSkillPatterns: () => Effect.Effect<ReadonlyArray<string>, AppError>;
  /** Read settings and return the configured agent IDs, defaulting to `[]`. */
  readonly getConfiguredAgents: () => Effect.Effect<ReadonlyArray<string>, AppError>;
  /** Read lockfile and return the skills lock map. */
  readonly getLockedSkills: () => Effect.Effect<SkillsLockMap, AppError>;
  /** Read lockfile and return the entry for a specific skill, or Option.none(). */
  readonly getLockedSkill: (name: string) => Effect.Effect<Option.Option<SkillLockEntry>, AppError>;
  /** Compute skill directory paths. If source is omitted, looks up the lock entry to determine source type. */
  readonly getSkillDir: (
    name: string,
    source?: SkillPathSource,
  ) => Effect.Effect<SkillDirPaths, AppError>;
  /** Add or update a skill in both settings and lockfile. Sets updatedAt. Serialized by semaphore. */
  readonly setSkill: (args: SetSkillArgs) => Effect.Effect<void, AppError>;
  /** Add or update a skill in lockfile only (skip settings). Used for pack dependencies. Serialized by semaphore. */
  readonly setSkillLock: (args: SetSkillArgs) => Effect.Effect<void, AppError>;
  /** Remove a skill from both settings and lockfile. No-op if absent. Serialized by semaphore. */
  readonly removeSkill: (name: string) => Effect.Effect<void, AppError>;
  /** Remove a skill from settings only (keep lockfile entry). Used when a pack still references the skill. Serialized by semaphore. */
  readonly removeSkillFromSettings: (name: string) => Effect.Effect<void, AppError>;
  /** Update a skill entry by applying an updater function. Collapses back to settings form. Serialized by semaphore. */
  readonly updateSkillEntry: (
    name: string,
    updater: (entry: NormalizedSkillEntry) => NormalizedSkillEntry,
  ) => Effect.Effect<void, AppError>;
  /** Create or overwrite a skill entry in settings only (no lockfile). Serialized by semaphore. */
  readonly setSkillEntry: (
    name: string,
    entry: NormalizedSkillEntry,
  ) => Effect.Effect<void, AppError>;
  /** Atomically rename a skill in both settings and lockfile. Serialized by semaphore. */
  readonly renameSkill: (oldName: string, newName: string) => Effect.Effect<void, AppError>;
  /** Update the agents field on a lock entry. Serialized by semaphore. */
  readonly updateLockEntryAgents: (
    name: string,
    agents: ReadonlyArray<string>,
  ) => Effect.Effect<void, AppError>;
  /** Append an agent ID if not already present and write to disk. Fails with AppError if invalid. Serialized by semaphore. */
  readonly addConfiguredAgent: (agentId: string) => Effect.Effect<void, AppError>;
  // --- Command taxonomy ---
  readonly getConfiguredCommands: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredCommand>,
    AppError
  >;
  readonly getImplicitCommands: () => Effect.Effect<
    Record.ReadonlyRecord<string, ImplicitCommand>,
    AppError
  >;
  readonly getUnmanagedCommands: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedCommand>,
    AppError
  >;
  readonly getInstalledCommands: () => Effect.Effect<
    Record.ReadonlyRecord<string, InstalledCommand>,
    AppError
  >;
  readonly getClassifiedCommands: () => Effect.Effect<
    Record.ReadonlyRecord<string, ClassifiedCommand>,
    AppError
  >;
  readonly getConfiguredExternalCommands: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredCommand>,
    AppError
  >;
  readonly getUnmanagedExternalCommands: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedCommand>,
    AppError
  >;
  readonly getIgnoredCommandPatterns: () => Effect.Effect<ReadonlyArray<string>, AppError>;
  // --- MCP Server taxonomy ---
  readonly getConfiguredMcpServers: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredExtensionRef>,
    AppError
  >;
  readonly getImplicitMcpServers: () => Effect.Effect<
    Record.ReadonlyRecord<string, ImplicitExtensionRef>,
    AppError
  >;
  readonly getUnmanagedMcpServers: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedExtensionRef>,
    AppError
  >;
  readonly getInstalledMcpServers: () => Effect.Effect<
    Record.ReadonlyRecord<string, InstalledExtensionRef>,
    AppError
  >;
  readonly getClassifiedMcpServers: () => Effect.Effect<
    Record.ReadonlyRecord<string, ClassifiedExtensionRef>,
    AppError
  >;
  readonly getConfiguredExternalMcpServers: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredExtensionRef>,
    AppError
  >;
  readonly getUnmanagedExternalMcpServers: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedExtensionRef>,
    AppError
  >;
  readonly getIgnoredMcpServerPatterns: () => Effect.Effect<ReadonlyArray<string>, AppError>;
  // --- Pack taxonomy ---
  readonly getConfiguredPacks: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredExtensionRef>,
    AppError
  >;
  readonly getImplicitPacks: () => Effect.Effect<
    Record.ReadonlyRecord<string, ImplicitExtensionRef>,
    AppError
  >;
  readonly getUnmanagedPacks: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedExtensionRef>,
    AppError
  >;
  readonly getInstalledPacks: () => Effect.Effect<
    Record.ReadonlyRecord<string, InstalledExtensionRef>,
    AppError
  >;
  readonly getClassifiedPacks: () => Effect.Effect<
    Record.ReadonlyRecord<string, ClassifiedExtensionRef>,
    AppError
  >;
  readonly getConfiguredExternalPacks: () => Effect.Effect<
    Record.ReadonlyRecord<string, ConfiguredExtensionRef>,
    AppError
  >;
  readonly getUnmanagedExternalPacks: () => Effect.Effect<
    Record.ReadonlyRecord<string, UnmanagedExtensionRef>,
    AppError
  >;
  readonly getIgnoredPackPatterns: () => Effect.Effect<ReadonlyArray<string>, AppError>;
  /** Read lockfile and return the packs lock map. */
  readonly getLockedPacks: () => Effect.Effect<PacksLockMap, AppError>;
  /** Read lockfile and return the entry for a specific pack, or Option.none(). */
  readonly getLockedPack: (name: string) => Effect.Effect<Option.Option<PackLockEntry>, AppError>;
  /** Add or update a pack in both settings and lockfile. Sets updatedAt. Serialized by semaphore. */
  readonly setPack: (args: SetPackArgs) => Effect.Effect<void, AppError>;
  /** Remove a pack from both settings and lockfile. No-op if absent. Serialized by semaphore. */
  readonly removePack: (name: string) => Effect.Effect<void, AppError>;
  /** Compute the pack directory path. Packs are always registry-sourced. */
  readonly getPackDir: (name: string, profile: string) => Effect.Effect<PackDirPath, AppError>;
  /** Read lockfile and return the commands lock map. */
  readonly getLockedCommands: () => Effect.Effect<CommandsLockMap, AppError>;
  /** Read lockfile and return the entry for a specific command, or Option.none(). */
  readonly getLockedCommand: (
    name: string,
  ) => Effect.Effect<Option.Option<CommandLockEntry>, AppError>;
  /** Add or update a command in both settings and lockfile. Sets updatedAt. Serialized by semaphore. */
  readonly setCommand: (args: SetCommandArgs) => Effect.Effect<void, AppError>;
  /** Add or update a command in lockfile only (skip settings). Used for pack dependencies. Serialized by semaphore. */
  readonly setCommandLock: (args: SetCommandArgs) => Effect.Effect<void, AppError>;
  /** Remove a command from both settings and lockfile. No-op if absent. Serialized by semaphore. */
  readonly removeCommand: (name: string) => Effect.Effect<void, AppError>;
  /** Read lockfile and return the MCP servers lock map. */
  readonly getLockedMcpServers: () => Effect.Effect<McpServersLockMap, AppError>;
  /** Read lockfile and return the entry for a specific MCP server, or Option.none(). */
  readonly getLockedMcpServer: (
    name: string,
  ) => Effect.Effect<Option.Option<McpServerLockEntry>, AppError>;
  /** Add or update an MCP server in both settings and lockfile. Sets updatedAt. Serialized by semaphore. */
  readonly setMcpServer: (args: SetMcpServerArgs) => Effect.Effect<void, AppError>;
  /** Add or update an MCP server in lockfile only (skip settings). Used for pack dependencies. Serialized by semaphore. */
  readonly setMcpServerLock: (args: SetMcpServerArgs) => Effect.Effect<void, AppError>;
  /** Remove an MCP server from both settings and lockfile. No-op if absent. Serialized by semaphore. */
  readonly removeMcpServer: (name: string) => Effect.Effect<void, AppError>;
  // --- Granular removal methods (settings-only or lockfile-only) ---
  /** Remove a skill from lockfile only (keep settings entry). Serialized by semaphore. */
  readonly removeSkillLock: (name: string) => Effect.Effect<void, AppError>;
  /** Remove a command from settings only (keep lockfile entry). Serialized by semaphore. */
  readonly removeCommandSettings: (name: string) => Effect.Effect<void, AppError>;
  /** Remove a command from lockfile only (keep settings entry). Serialized by semaphore. */
  readonly removeCommandLock: (name: string) => Effect.Effect<void, AppError>;
  /** Remove an MCP server from settings only (keep lockfile entry). Serialized by semaphore. */
  readonly removeMcpServerSettings: (name: string) => Effect.Effect<void, AppError>;
  /** Remove an MCP server from lockfile only (keep settings entry). Serialized by semaphore. */
  readonly removeMcpServerLock: (name: string) => Effect.Effect<void, AppError>;
  /** Remove a pack from settings only (keep lockfile entry). Serialized by semaphore. */
  readonly removePackSettings: (name: string) => Effect.Effect<void, AppError>;
  /** Remove a pack from lockfile only (keep settings entry). Serialized by semaphore. */
  readonly removePackLock: (name: string) => Effect.Effect<void, AppError>;
  // --- Pack dependency queries ---
  /** Check if an extension target is referenced by any installed pack's dependency maps. */
  readonly isExtensionRequiredByInstalledPack: (
    target: import("../workflows/install-operation/workflow.js").ExtensionTarget,
  ) => Effect.Effect<boolean, AppError>;
  /** Update lockfile entry for a target to indicate it is retained as a pack dependency. No-op if not found. Serialized by semaphore. */
  readonly markDependencyRetainedInLockfile: (
    target: import("../workflows/install-operation/workflow.js").ExtensionTarget,
  ) => Effect.Effect<void, AppError>;
}
