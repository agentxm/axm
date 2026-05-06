/**
 * WorkspaceMutations initialization logic.
 *
 * Handles initial setup of project and user-scope workspaces: agent detection,
 * interactive agent selection, and settings/lockfile creation.
 *
 * @internal
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { detectAgents } from "../agents/index.js";
import { AGENTS } from "../agents/registry.js";
import type { AgentDescriptor, AgentId } from "../agents/types.js";
import { isNonInteractive } from "../cli-flags/index.js";
import { makeAppError } from "../app-error/index.js";
import { CliRenderer } from "../cli-renderer/index.js";
import { LOCKFILE_NAME, writeLockfile } from "../lockfile/index.js";
import {
  createDefaultSettings,
  SETTINGS_FILENAME,
  type Settings,
  writeSettings,
} from "../settings/index.js";
import type { WorkspaceMutationsOptions } from "./service-interface.js";
import { AgentRootResolverLive } from "./read-model/agent-root-resolver.js";
import { makeWorkspaceReadModel, WorkspaceReadModelConfig } from "./read-model/service.js";
import { WorkspaceInitializationInteraction } from "./initialization-interaction.js";
import { type WorkspaceLocation, getAxmDir } from "./paths.js";

const SELECT_AGENTS_PROMPT_MISSING = makeAppError({
  code: "PROMPT_REQUIRED",
  what: "Interactive prompt required: Select agents to configure",
  howToFix: "Provide WorkspaceInitializationInteraction in the runtime.",
});

const isKnownAgentId = (id: string): id is AgentId => Object.hasOwn(AGENTS, id);

const allAgentDescriptors = (): ReadonlyArray<AgentDescriptor> => Object.values(AGENTS);

const DEFAULT_SETUP_SKILLS = {
  axm: { source: "@agentxm/skills/axm", enabled: true, authored: false },
} as const satisfies NonNullable<Settings["skills"]>;

const readSettingsFromReadModel = (
  scope: "project" | "user",
  projectRoot: string,
  userHome: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const platformLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );
    const env = Layer.mergeAll(
      platformLayer,
      Layer.succeed(WorkspaceReadModelConfig, {
        projectRoot,
        userHome,
        allowedRoot: "/",
      }),
      AgentRootResolverLive.pipe(Layer.provide(platformLayer)),
    );
    return yield* makeWorkspaceReadModel(scope).pipe(
      Effect.flatMap((readModel) => readModel.state.settings),
      Effect.provide(env),
      Effect.mapError((error) =>
        makeAppError({
          code: "SETTINGS_PARSE_FAILED",
          what: "Failed to read workspace settings",
          cause: error,
        }),
      ),
    );
  });

/**
 * Initialize project workspace by detecting and selecting agents.
 *
 * @param localDir - Path to local .axm directory
 * @param options - WorkspaceMutations options
 * @returns Effect yielding selected agent IDs
 */
export const initializeProjectWorkspace = (localDir: string, options: WorkspaceMutationsOptions) =>
  Effect.gen(function* () {
    const nonInteractive = yield* isNonInteractive;

    // Select agents based on options
    let selectedAgents: ReadonlyArray<AgentDescriptor>;

    // If explicit agents are provided, use those (no detection needed)
    const agents = options.agents;
    if (agents !== undefined && agents.length > 0) {
      const renderer = yield* CliRenderer;
      const requestedIds = [...agents];
      selectedAgents = requestedIds.flatMap((id) => {
        return isKnownAgentId(id) ? [AGENTS[id]] : [];
      });
      const unrecognized = requestedIds.filter((id) => !isKnownAgentId(id));
      if (unrecognized.length > 0) {
        yield* renderer.warn(
          `Unrecognized agent(s): ${unrecognized.join(", ")}. Use 'axm setup --help' to see available agents.`,
        );
      }
    } else {
      // Detect installed agents
      const detectedAgents = yield* detectAgents(options.projectRoot ?? process.cwd()).pipe(
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
        const interaction = yield* Effect.serviceOption(WorkspaceInitializationInteraction);
        const allAgents = allAgentDescriptors();
        const detectedIds = Array.map(detectedAgents, (a) => a.id);

        const selectedIds = Option.isSome(interaction)
          ? yield* interaction.value.selectAgents({
              allAgents,
              detectedIds,
            })
          : yield* SELECT_AGENTS_PROMPT_MISSING;

        selectedAgents = [...selectedIds].flatMap((id) => {
          return isKnownAgentId(id) ? [AGENTS[id]] : [];
        });
      }
    }

    // Extract agent IDs for settings
    const agentIds = selectedAgents.map((a) => a.id);

    // Create settings with selected agents and the default setup skill.
    const settings: Settings = { agents: agentIds, skills: DEFAULT_SETUP_SKILLS };
    yield* writeSettings(localDir, settings);

    // Create empty lockfile
    yield* writeLockfile(localDir, { lockfileVersion: 1, skills: {} });

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

    // Create settings.json with default setup skills if missing
    if (!settingsExists) {
      yield* writeSettings(globalDir, { skills: DEFAULT_SETUP_SKILLS });
    }

    // Create axm-lock.yaml with version 1, empty skills if missing
    if (!lockfileExists) {
      yield* writeLockfile(globalDir, { lockfileVersion: 1, skills: {} });
    }

    return !settingsExists;
  });

/**
 * Ensure project workspace is initialized, returning local settings.
 *
 * Reads existing local settings or runs the initialization flow when missing.
 *
 * @param localDir - Path to local .axm directory
 * @param options - WorkspaceMutations options
 * @returns Effect yielding local Settings
 */
export const ensureProjectWorkspaceInitialized = (
  localDir: string,
  options: WorkspaceMutationsOptions,
) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const globalDir = yield* getAxmDir("user");
    const localSettingsResult = yield* readSettingsFromReadModel(
      "project",
      path.dirname(localDir),
      path.dirname(globalDir),
    ).pipe(
      Effect.map(
        Option.match({
          onNone: () => ({ found: false as const, settings: createDefaultSettings() }),
          onSome: (s) => ({ found: true as const, settings: s }),
        }),
      ),
    );

    if (!localSettingsResult.found) {
      // Initialize project workspace and return the settings it wrote
      const settings = yield* initializeProjectWorkspace(localDir, options);
      return { settings, initialized: true as const };
    }

    return { settings: localSettingsResult.settings, initialized: false as const };
  });

export const bootstrapWorkspace = (options: WorkspaceMutationsOptions) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const workspaceDir = yield* getAxmDir(options.scope, options.projectRoot);
    const location: WorkspaceLocation = {
      scope: options.scope,
      path: workspaceDir,
      baseDir: path.dirname(workspaceDir),
    };

    if (options.scope === "user") {
      const initialized = yield* ensureGlobalWorkspaceInitialized(workspaceDir);
      const localDir = yield* getAxmDir("project", options.projectRoot);
      const settings = yield* readSettingsFromReadModel(
        "user",
        path.dirname(localDir),
        path.dirname(workspaceDir),
      ).pipe(Effect.map(Option.getOrElse(() => createDefaultSettings())));
      return { settings, location, initialized };
    }

    const { settings, initialized } = yield* ensureProjectWorkspaceInitialized(
      workspaceDir,
      options,
    );
    return { settings, location, initialized };
  });
