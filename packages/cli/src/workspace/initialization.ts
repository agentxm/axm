/**
 * Workspace initialization logic.
 *
 * Handles initial setup of project and user-scope workspaces: agent detection,
 * interactive agent selection, settings/lockfile creation, and builtin pack
 * materialization.
 *
 * @internal
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { type AgentDescriptor, detectAgents, getAllAgents, getAgentById } from "../agents/index.js";
import { makeCliError } from "../cli-error/index.js";
import { ClackPrompt } from "../clack-effect/index.js";
import { LOCKFILE_NAME, writeLockfile } from "../lockfile/index.js";
import {
  createDefaultSettings,
  readSettings,
  SETTINGS_FILENAME,
  type Settings,
  writeSettings,
} from "../settings/index.js";
import { materializeBuiltinPack } from "./builtin-packs.js";
import type { WorkspaceContextOptions } from "./service.js";

/**
 * Initialize project workspace by detecting and selecting agents.
 *
 * @param localDir - Path to local .axm directory
 * @param options - Workspace context options
 * @param resolvedNonInteractive - Pre-resolved non-interactive flag (accounts for TTY/CI)
 * @returns Effect yielding selected agent IDs
 */
export const initializeProjectWorkspace = (
  localDir: string,
  options: WorkspaceContextOptions,
  resolvedNonInteractive: boolean,
) =>
  Effect.gen(function* () {
    // Select agents based on options
    let selectedAgents: ReadonlyArray<AgentDescriptor>;

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

      if (resolvedNonInteractive) {
        // Non-interactive mode: auto-select all detected agents
        selectedAgents = detectedAgents;
      } else {
        // Interactive mode — single multiselect with detected agents pre-selected
        const prompt = yield* ClackPrompt;
        const allAgents = getAllAgents();
        const detectedIds = Array.map(detectedAgents, (a) => a.id);

        const selectedIds = yield* prompt.multiselect<string>({
          message: "Select agents to configure",
          options: allAgents.map((agent) => ({
            value: agent.id,
            label: agent.name,
            hint: `skills: ${agent.skills.dir}`,
          })),
          initialValues: detectedIds,
          required: false,
        });

        selectedAgents = Array.filterMap([...selectedIds], (id) => getAgentById(id));
      }
    }

    // Extract agent IDs for settings
    const agentIds = Array.map(selectedAgents, (a) => a.id);

    // Create settings with selected agents (satisfies ensures type safety without cast)
    const settings = { agents: agentIds } satisfies Settings;
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
 */
export const ensureProjectWorkspaceInitialized = (
  localDir: string,
  options: WorkspaceContextOptions,
  resolvedNonInteractive: boolean,
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
      return yield* initializeProjectWorkspace(localDir, options, resolvedNonInteractive);
    }

    return localSettingsResult.settings;
  });
