/**
 * Workspace context service for CLI commands.
 *
 * Provides access to parsed workspace settings and lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import { type AgentConfig, detectAgents, getAllAgents, getAgentById } from "../agents/index.js";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { type LockfileError, LOCKFILE_NAME } from "../lockfile/index.js";
import { writeLockfile } from "../lockfile/lockfile.js";
import {
  createDefaultSettings,
  readSettings,
  type SettingsError,
  SettingsParseError,
  SETTINGS_FILENAME,
  type Settings,
  writeSettings,
} from "../settings/index.js";
import { getAxmDir } from "./paths.js";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Clack } from "../clack-effect/service.js";
import { PromptCancelled, PromptError } from "../clack-effect/errors.js";
import { WorkspaceInitializationError, WorkspaceNotInitializedError } from "./errors.js";
import type { Operation, Plan } from "./plan.js";
import { displayPlan } from "./display-plan.js";
import { applyPlan, type ExecutionContext, type Handlers } from "./apply-plan.js";

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
export type WorkspaceContextError =
  | WorkspaceNotInitializedError
  | WorkspaceInitializationError
  | Exclude<SettingsError, { _tag: "SettingsNotFoundError" }>
  | LockfileError
  | PromptCancelled;

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
const initializeProjectWorkspace = (
  localDir: string,
  options: WorkspaceContextOptions,
): Effect.Effect<
  Settings,
  WorkspaceInitializationError | PromptCancelled,
  FileSystem.FileSystem | Path.Path | Clack
> =>
  Effect.gen(function* () {
    // Select agents based on options
    let selectedAgents: AgentConfig[];

    // If explicit agents are provided, use those (no detection needed)
    if (Option.isSome(options.agents) && options.agents.value.length > 0) {
      selectedAgents = Array.filterMap([...options.agents.value], (id) => getAgentById(id));
    } else {
      // Detect installed agents
      const detectedAgents = yield* detectAgents().pipe(
        Effect.mapError(
          (error) =>
            new WorkspaceInitializationError({
              message: `Failed to detect agents: ${error.message}`,
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
          new WorkspaceInitializationError({
            message:
              "Cannot initialize workspace in non-interactive mode. " +
              "Use --yes to auto-select detected agents, or run interactively.",
          }),
        );
      } else {
        // Interactive mode - prompt for agent selection
        const clack = yield* Clack;
        const allAgents = getAllAgents();

        const agentMultiselect = (initialIds: Option.Option<readonly string[]>) =>
          clack
            .multiselect<AgentConfig>("Select agents to configure", allAgents, {
              toOption: (agent) => ({
                value: agent.id,
                label: agent.name,
                hint: Option.some(`skills: ${agent.skills.dir}`),
              }),
              initialValues: initialIds,
              required: Option.some(false),
            })
            .pipe(
              Effect.map((agents) => [...agents]),
              Effect.mapError((error) => {
                if (error._tag === "PromptCancelled") {
                  return error;
                }
                return new WorkspaceInitializationError({
                  message: `Failed to prompt for agent selection: ${error.message}`,
                  cause: error,
                });
              }),
            );

        if (detectedAgents.length === 0) {
          // No agents detected — go straight to multiselect of all agents, none pre-selected
          selectedAgents = yield* agentMultiselect(Option.none());
        } else {
          // Show choice: use detected agents or pick manually
          const detectedNames = Array.map(detectedAgents, (a) => a.name).join(", ");
          type InitChoice = "auto" | "choose";
          const items: readonly { id: InitChoice; label: string }[] = [
            { id: "auto", label: `Setup with auto-detected agents (${detectedNames})` },
            { id: "choose", label: "Let me choose" },
          ];

          const choice = yield* clack
            .select<{ id: InitChoice; label: string }>(
              "How would you like to configure agents?",
              items,
              (item) => ({
                value: item.id,
                label: item.label,
                hint: item.id === "auto" ? Option.some("Recommended") : Option.none(),
              }),
            )
            .pipe(
              Effect.mapError((error) => {
                if (error._tag === "PromptCancelled") {
                  return error;
                }
                return new WorkspaceInitializationError({
                  message: `Failed to prompt for agent selection: ${error.message}`,
                  cause: error,
                });
              }),
            );

          if (choice.id === "auto") {
            selectedAgents = detectedAgents;
          } else {
            // Show multiselect of ALL agents, detected ones pre-selected
            const detectedIds = Array.map(detectedAgents, (a) => a.id);
            selectedAgents = yield* agentMultiselect(Option.some(detectedIds));
          }
        }
      }
    }

    // Extract agent IDs for settings
    const agentIds = Array.map(selectedAgents, (a) => a.id);

    // Create settings with selected agents (satisfies ensures type safety without cast)
    const settings = { agents: agentIds } satisfies Settings;
    yield* writeSettings(localDir, settings).pipe(
      Effect.mapError(
        (error) =>
          new WorkspaceInitializationError({
            message: `Failed to write settings: ${error.message}`,
            cause: error,
          }),
      ),
    );

    // Create empty lockfile
    yield* writeLockfile(localDir, { lockfileVersion: 1, skills: {} }).pipe(
      Effect.mapError(
        (error) =>
          new WorkspaceInitializationError({
            message: `Failed to write lockfile: ${error.message}`,
            cause: error,
          }),
      ),
    );

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
      Effect.mapError(
        (error) =>
          new SettingsParseError({
            path: settingsPath,
            message: `Failed to check if settings file exists: ${settingsPath}`,
            cause: error,
          }),
      ),
    );
    const lockfileExists = yield* fs.exists(lockfilePath).pipe(
      Effect.mapError(
        (error) =>
          new WorkspaceInitializationError({
            message: `Failed to check if lockfile exists: ${lockfilePath}`,
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
      Effect.map((s) => ({ found: true as const, settings: s })),
      Effect.catchTag("SettingsNotFoundError", () =>
        // Use createDefaultSettings() instead of unsafe cast
        Effect.succeed({ found: false as const, settings: createDefaultSettings() }),
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
 * Clack is required for agent selection prompts.
 *
 * @param options - Workspace context options
 * @returns Effect yielding WorkspaceContextService
 *
 * @internal Not exported from barrel - use layer() for external access
 */
const make = (
  options: WorkspaceContextOptions,
): Effect.Effect<
  WorkspaceContextService,
  WorkspaceContextError,
  FileSystem.FileSystem | Path.Path | Clack
> =>
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
          const clack = yield* Clack;
          if (options.preview) {
            yield* clack.log.info("Previewing changes...");
            yield* displayPlan(plan);
            if (options.yes) {
              yield* clack.log.info("Pre-approved via --yes, applying changes...");
              return yield* applyPlan(plan, handlers);
            } else if (resolvedNonInteractive) {
              yield* clack.log.warn(
                "Cannot prompt in non-interactive mode. Use --yes to apply, or remove --preview.",
              );
              return { ...plan, jobs: [] } satisfies Plan<Op>;
            } else {
              const confirmed = yield* clack.confirm("Apply changes?");
              if (!confirmed) {
                yield* clack.outro("Cancelled.");
                return { ...plan, jobs: [] } satisfies Plan<Op>;
              }
              return yield* applyPlan(plan, handlers);
            }
          } else {
            yield* displayPlan(plan);
            return yield* applyPlan(plan, handlers);
          }
        }),
    };
  });

/**
 * Create a layer that loads workspace context from disk.
 *
 * When project initialization is needed and `yes=false` and `nonInteractive=false`,
 * Clack is required for agent selection prompts.
 *
 * @param options - Workspace context options
 * @returns Layer providing WorkspaceContext
 *
 * @experimental This API is unstable and may change without notice.
 */
export const layer = (
  options: WorkspaceContextOptions,
): Layer.Layer<Workspace, WorkspaceContextError, FileSystem.FileSystem | Path.Path | Clack> =>
  Layer.effect(Workspace, make(options));

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
  ) => Effect.Effect<Plan<Op>, PromptCancelled | PromptError, Clack | ExecutionContext<T>>;
}
