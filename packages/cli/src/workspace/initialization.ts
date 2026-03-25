/**
 * Workspace initialization logic.
 *
 * Handles initial setup of project and user-scope workspaces: agent detection,
 * interactive agent selection, settings/lockfile creation, and builtin pack
 * materialization.
 *
 * @internal
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  type AgentDescriptor,
  detectAgents,
  getAllAgents,
  getAgentById,
} from "@axm.sh/core/unstable/agents";
import { isNonInteractive } from "@axm.sh/core/unstable/cli-flags";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { Output } from "@axm.sh/core/unstable/output";
import { Input } from "@axm.sh/core/unstable/input";
import { LOCKFILE_NAME, writeLockfile } from "@axm.sh/core/unstable/lockfile";
import {
  createDefaultSettings,
  readSettings,
  SETTINGS_FILENAME,
  type Settings,
  writeSettings,
} from "@axm.sh/core/unstable/settings";
import { materializeBuiltinPack } from "./builtin-packs.js";
import type { WorkspaceContextOptions } from "./service.js";

/**
 * Initialize project workspace by detecting and selecting agents.
 *
 * @param localDir - Path to local .axm directory
 * @param options - Workspace context options
 * @returns Effect yielding selected agent IDs
 */
export const initializeProjectWorkspace = (localDir: string, options: WorkspaceContextOptions) =>
  Effect.gen(function* () {
    const nonInteractive = yield* isNonInteractive;

    // Select agents based on options
    let selectedAgents: ReadonlyArray<AgentDescriptor>;

    // If explicit agents are provided, use those (no detection needed)
    const agents = options.agents ?? Option.none();
    if (Option.isSome(agents) && agents.value.length > 0) {
      const output = yield* Output;
      const requestedIds = [...agents.value];
      selectedAgents = requestedIds.flatMap((id) => {
        const agent = getAgentById(id);
        return Option.isSome(agent) ? [agent.value] : [];
      });
      const unrecognized = requestedIds.filter((id) => Option.isNone(getAgentById(id)));
      if (unrecognized.length > 0) {
        yield* output.warn(
          `Unrecognized agent(s): ${unrecognized.join(", ")}. Use 'axm init --help' to see available agents.`,
        );
      }
    } else {
      // Detect installed agents
      const detectedAgents = yield* detectAgents(process.cwd()).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "WORKSPACE_INITIALIZATION_FAILED",
            what: `Failed to detect agents: ${error.message}`,
            cause: error,
          }),
        ),
      );

      if (nonInteractive) {
        // Non-interactive mode: auto-select all detected agents
        selectedAgents = detectedAgents;
      } else {
        // Interactive mode — single multiselect with detected agents pre-selected
        const input = yield* Input;
        const allAgents = getAllAgents();
        const detectedIds = Array.map(detectedAgents, (a) => a.id);

        const selectedIds = yield* input.multiselect<string>({
          message: "Select agents to configure",
          options: allAgents.map((agent) => ({
            value: agent.id,
            label: agent.name,
            hint: `skills: ${agent.skills.dir}`,
          })),
          initialValues: detectedIds,
          required: false,
        });

        selectedAgents = [...selectedIds].flatMap((id) => {
          const agent = getAgentById(id);
          return Option.isSome(agent) ? [agent.value] : [];
        });
      }
    }

    // Extract agent IDs for settings
    const agentIds = selectedAgents.map((a) => a.id);

    // Create settings with selected agents (satisfies ensures type safety without cast)
    const settings: Settings = { agents: agentIds };
    yield* writeSettings(localDir, settings);

    // Create empty lockfile
    yield* writeLockfile(localDir, { lockfileVersion: 1, skills: {} });

    // Materialize builtin pack
    yield* materializeBuiltinPack(localDir, agentIds);

    return settings;
  });

/**
 * Ensure user-scope workspace directory has settings.json and axm-lock.yaml.
 *
 * Creates missing files with empty defaults.
 *
 * @param globalDir - Path to user-scope .axm directory
 */
export const ensureGlobalWorkspaceInitialized = (globalDir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const settingsPath = path.join(globalDir, SETTINGS_FILENAME);
    const lockfilePath = path.join(globalDir, LOCKFILE_NAME);

    const settingsExists = yield* fs.exists(settingsPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "SETTINGS_PARSE_FAILED",
          what: `Failed to check if settings file exists: ${settingsPath}`,
          cause: error,
        }),
      ),
    );
    const lockfileExists = yield* fs.exists(lockfilePath).pipe(
      Effect.mapError((error) =>
        makeAppError({
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
 */
export const ensureProjectWorkspaceInitialized = (
  localDir: string,
  options: WorkspaceContextOptions,
) =>
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
