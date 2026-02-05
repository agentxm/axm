/**
 * Workspace context service for CLI commands.
 *
 * Provides access to parsed workspace settings and lockfile.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as FileSystem from "@effect/platform/FileSystem";
import { type AgentConfig, detectAgents, getAgentById } from "../agents/index.js";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import { type LockfileError, readLockfile, writeLockfile } from "./lockfile.js";
import { readSettings, type SettingsError, SettingsParseError, writeSettings } from "./settings.js";
import type { Settings } from "./settings-schema.js";
import { getAxmDir, LOCKFILE_NAME, SETTINGS_FILENAME } from "./paths.js";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Clack } from "../clack-effect/service.js";
import { PromptCancelled } from "../clack-effect/errors.js";
import { WorkspaceInitializationError, WorkspaceNotInitializedError } from "./errors.js";
import type { WorkspaceContextService } from "./service-types.js";

/**
 * Effect service tag for workspace context.
 *
 * @experimental This API is unstable and may change without notice.
 */
export class WorkspaceContext extends Context.Tag("@agentxm/cli/WorkspaceContext")<
  WorkspaceContext,
  WorkspaceContextService
>() {
  /**
   * Create a layer from a custom service implementation.
   */
  static readonly layer = (service: WorkspaceContextService): Layer.Layer<WorkspaceContext> =>
    Layer.succeed(WorkspaceContext, service);
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
  /** Disable all prompts; fail if user input would be required */
  readonly nonInteractive: boolean;
  /** Explicit agent IDs to use (overrides detection and prompting) */
  readonly agents?: readonly string[];
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
  readonly string[],
  WorkspaceInitializationError | PromptCancelled,
  FileSystem.FileSystem | Clack
> =>
  Effect.gen(function* () {
    // Select agents based on options
    let selectedAgents: AgentConfig[];

    // If explicit agents are provided, use those (no detection needed)
    if (options.agents && options.agents.length > 0) {
      selectedAgents = Arr.filterMap([...options.agents], (id) =>
        Option.map(getAgentById(id), (agent) => agent),
      );
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
      } else if (options.nonInteractive) {
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

        if (detectedAgents.length === 0) {
          // No agents detected - proceed with empty selection
          selectedAgents = [];
        } else {
          // Prompt for agent selection
          selectedAgents = yield* clack
            .multiselect<AgentConfig>("Select agents to configure", detectedAgents, {
              toOption: (agent) => ({
                value: agent.id,
                label: agent.name,
                hint: `skills: ${agent.skills.projectDir}`,
              }),
              initialValues: detectedAgents.map((a) => a.id),
              required: false,
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
        }
      }
    }

    // Extract agent IDs for settings
    const agentIds = selectedAgents.map((a) => a.id);

    // Create settings with selected agents
    const settings: Settings = { agents: agentIds as Settings["agents"] };
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

    return agentIds;
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
 * @experimental This API is unstable and may change without notice.
 */
export const make = (
  options: WorkspaceContextOptions,
): Effect.Effect<WorkspaceContextService, WorkspaceContextError, FileSystem.FileSystem | Clack> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const globalDir = getAxmDir(true);
    const localDir = getAxmDir(false);
    const workspaceDir = options.global ? globalDir : localDir;

    // Global workspace auto-initialization
    if (options.global) {
      const settingsPath = `${globalDir}/${SETTINGS_FILENAME}`;
      const lockfilePath = `${globalDir}/${LOCKFILE_NAME}`;

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
            new SettingsParseError({
              path: lockfilePath,
              message: `Failed to check if lockfile exists: ${lockfilePath}`,
              cause: error,
            }),
        ),
      );

      // Create settings.json with {} if missing
      if (!settingsExists) {
        // Note: writeSettings is typed as SettingsError but only throws SettingsWriteError
        // We catch SettingsNotFoundError to satisfy TypeScript, though it never occurs
        yield* writeSettings(globalDir, {}).pipe(
          Effect.catchTag("SettingsNotFoundError", (e) =>
            Effect.fail(
              new SettingsParseError({
                path: e.path,
                message: `Unexpected error during settings creation: ${e.message}`,
                cause: e,
              }),
            ),
          ),
        );
      }

      // Create axm-lock.yaml with version 1, empty skills if missing
      if (!lockfileExists) {
        yield* writeLockfile(globalDir, { lockfileVersion: 1, skills: {} });
      }
    }

    // Global settings: optional (fallback to {})
    const globalSettings = yield* readSettings(globalDir).pipe(
      Effect.catchTag("SettingsNotFoundError", () => Effect.succeed<Settings>({})),
    );

    // Local settings: initialize if missing when global=false
    let localSettings: Settings = {};
    if (!options.global) {
      const localSettingsResult = yield* readSettings(localDir).pipe(
        Effect.map((s) => ({ found: true as const, settings: s })),
        Effect.catchTag("SettingsNotFoundError", () =>
          Effect.succeed({ found: false as const, settings: {} as Settings }),
        ),
      );

      if (!localSettingsResult.found) {
        // Initialize project workspace
        yield* initializeProjectWorkspace(localDir, options);

        // Re-read settings after initialization
        localSettings = yield* readSettings(localDir).pipe(
          Effect.catchTag("SettingsNotFoundError", () =>
            Effect.fail(new WorkspaceNotInitializedError({ path: localDir })),
          ),
        );
      } else {
        localSettings = localSettingsResult.settings;
      }
    }

    // Merge: local overrides global
    const settings: Settings = options.global
      ? globalSettings
      : { ...globalSettings, ...localSettings };

    // Lockfile from workspace dir
    const lockfile = yield* readLockfile(workspaceDir);

    return {
      global: options.global,
      settings,
      lockfile,
      path: workspaceDir,
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
): Layer.Layer<WorkspaceContext, WorkspaceContextError, FileSystem.FileSystem | Clack> =>
  Layer.effect(WorkspaceContext, make(options));
