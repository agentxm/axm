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
import {
  resolveInstructionMechanism,
  syncInstructions,
  type InstructionMechanism,
} from "../agents/instructions.js";
import {
  isConfigurableAgentId,
  type AgentDescriptor,
  type AgentId,
  type ConfigurableAgentId,
} from "../agents/types.js";
import { isNonInteractive } from "../cli-flags/index.js";
import { makeAppError } from "../app-error/index.js";
import { CliRenderer } from "../cli-renderer/index.js";
import { LOCKFILE_NAME, LOCKFILE_VERSION, writeLockfile } from "../lockfile/index.js";
import {
  createDefaultSettings,
  SETTINGS_FILENAME,
  type Settings,
  writeSettings,
} from "../settings/index.js";
import { makeAbsolutePath } from "../utils/path-types.js";
import type { WorkspaceMutationsOptions } from "./service-interface.js";
import { AgentRootResolverLive } from "./read-model/agent-root-resolver.js";
import { makeWorkspaceReadModel, WorkspaceReadModelConfig } from "./read-model/service.js";
import { WorkspaceInitializationInteraction } from "./initialization-interaction.js";
import { type WorkspaceLocation, getAxmDir, locateWorkspace } from "./paths.js";

const SELECT_AGENTS_PROMPT_MISSING = makeAppError({
  code: "usage",
  detail: "Interactive prompt required: Select agents to configure",
  suggestions: [{ description: "Provide WorkspaceInitializationInteraction in the runtime." }],
});

const SETUP_PHASES = "Detect · Agents · Instructions · Review";
const DEFAULT_INSTRUCTIONS_FILE = "AGENTS.md";
const DEFAULT_INSTRUCTIONS_GITIGNORE = true;
const POPULAR_AGENT_IDS = [
  "claude-code",
  "codex",
  "cursor",
  "github-copilot",
  "gemini-cli",
  "opencode",
] as const;
const INSTRUCTION_SOURCE_CANDIDATES = [
  DEFAULT_INSTRUCTIONS_FILE,
  "CLAUDE.md",
  "GEMINI.md",
  "QWEN.md",
  "replit.md",
  ".cursorrules",
] as const;

const isKnownAgentId = (id: string): id is AgentId => Object.hasOwn(AGENTS, id);

const isKnownConfigurableAgentId = (id: string): id is ConfigurableAgentId =>
  isKnownAgentId(id) && isConfigurableAgentId(id);

const allAgentDescriptors = (
  preferredIds: ReadonlyArray<string>,
): ReadonlyArray<AgentDescriptor> => {
  const preferred = preferredIds.flatMap((id) =>
    isKnownConfigurableAgentId(id) ? [AGENTS[id]] : [],
  );
  const preferredSet = new Set(preferred.map((agent) => agent.id));
  const remaining = Object.values(AGENTS).filter(
    (agent) => isConfigurableAgentId(agent.id) && !preferredSet.has(agent.id),
  );
  return [...preferred, ...remaining];
};

const DEFAULT_SETUP_SKILLS = {
  axm: { source: "@agentxm/skills/axm", enabled: true, authored: false },
} as const satisfies NonNullable<Settings["skills"]>;

interface SetupInstructionSourceChoice {
  readonly fileName: string;
  readonly exists: boolean;
  readonly lines: number;
  readonly content: Option.Option<string>;
}

interface SetupPlanRow {
  readonly target: string;
  readonly action: string;
  readonly detail: string;
}

const instructionValueFromSettings = (settings: Settings) => settings.rulesConfig?.instructions;

const currentInstructionFileName = (settings: Settings): string => {
  const value = instructionValueFromSettings(settings);
  if (value === undefined || value === false) return DEFAULT_INSTRUCTIONS_FILE;
  return value.fileName ?? DEFAULT_INSTRUCTIONS_FILE;
};

const currentInstructionSyncEnabled = (settings: Settings): boolean => {
  const value = instructionValueFromSettings(settings);
  return value !== false;
};

const readFileOption = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(filePath).pipe(Effect.option);
  });

const fileExists = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.exists(filePath).pipe(Effect.catch(() => Effect.succeed(false)));
  });

const lineCount = (content: string): number => {
  if (content.length === 0) return 0;
  return content.split(/\r\n|\r|\n/).length;
};

const instructionSourceChoices = (workspaceRoot: string, defaultFileName: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const names = [
      defaultFileName,
      ...INSTRUCTION_SOURCE_CANDIDATES.filter((candidate) => candidate !== defaultFileName),
    ];
    const uniqueNames = [...new Set(names)];
    return yield* Effect.forEach(
      uniqueNames,
      (fileName) =>
        Effect.gen(function* () {
          const content = yield* readFileOption(path.join(workspaceRoot, fileName));
          return {
            fileName,
            exists: Option.isSome(content),
            lines: Option.match(content, { onNone: () => 0, onSome: lineCount }),
            content,
          } satisfies SetupInstructionSourceChoice;
        }),
      { concurrency: "unbounded" },
    );
  });

const richestExistingInstructionFile = (
  choices: ReadonlyArray<SetupInstructionSourceChoice>,
): Option.Option<SetupInstructionSourceChoice> => {
  const existing = choices.filter((choice) => Option.isSome(choice.content));
  if (existing.length === 0) return Option.none<SetupInstructionSourceChoice>();
  const ranked = [...existing].sort((a, b) => b.lines - a.lines);
  const first = ranked[0];
  return first === undefined ? Option.none<SetupInstructionSourceChoice>() : Option.some(first);
};

const sourceContentForApply = (args: {
  readonly selectedFileName: string;
  readonly choices: ReadonlyArray<SetupInstructionSourceChoice>;
}): Option.Option<string> => {
  const selected = args.choices.find((choice) => choice.fileName === args.selectedFileName);
  if (selected !== undefined && Option.isSome(selected.content)) return Option.none<string>();
  const richest = richestExistingInstructionFile(args.choices);
  return Option.match(richest, {
    onNone: () => Option.some(""),
    onSome: (choice) => choice.content,
  });
};

const writeSourceFileIfMissing = (args: {
  readonly workspaceRoot: string;
  readonly fileName: string;
  readonly content: Option.Option<string>;
  readonly dryRun: boolean;
}) =>
  Effect.gen(function* () {
    if (Option.isNone(args.content)) return Option.none<string>();
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const filePath = path.join(args.workspaceRoot, args.fileName);
    const exists = yield* fileExists(filePath);
    if (exists) return Option.none<string>();
    if (!args.dryRun) {
      yield* fs.makeDirectory(path.dirname(filePath), { recursive: true }).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "internal",
            detail: `Failed to create instruction source directory: ${path.dirname(filePath)}`,
            cause: error,
          }),
        ),
      );
      yield* fs.writeFileString(filePath, args.content.value).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "internal",
            detail: `Failed to write instruction source file: ${filePath}`,
            cause: error,
          }),
        ),
      );
    }
    return Option.some(filePath);
  });

const instructionMechanismLabel = (mechanism: InstructionMechanism): string => {
  switch (mechanism) {
    case "native":
      return "in sync (native)";
    case "symlink":
      return "write ← symlink";
    case "copy":
      return "write ← copy";
    case "adapter":
      return "unsupported";
  }
};

const instructionPlanRows = (args: {
  readonly selectedAgents: ReadonlyArray<AgentDescriptor>;
  readonly sourceFileName: string;
  readonly sourceWillBeCreated: boolean;
  readonly sourceSeed: Option.Option<SetupInstructionSourceChoice>;
}): ReadonlyArray<SetupPlanRow> => [
  {
    target: args.sourceFileName,
    action: args.sourceWillBeCreated ? "create" : "in sync",
    detail: Option.match(args.sourceSeed, {
      onNone: () => "source",
      onSome: (choice) => `seeded from ${choice.fileName}`,
    }),
  },
  ...args.selectedAgents.map((agent) => {
    if (agent.instructions === undefined) {
      return {
        target: agent.name,
        action: "skip",
        detail: "no instruction convention",
      } satisfies SetupPlanRow;
    }
    const mechanism = resolveInstructionMechanism(agent.instructions, true);
    return {
      target:
        agent.instructions.kind === "own-file"
          ? agent.instructions.file
          : agent.instructions.kind === "rules-dir"
            ? agent.instructions.dir
            : agent.name,
      action: instructionMechanismLabel(mechanism),
      detail: agent.name,
    } satisfies SetupPlanRow;
  }),
  {
    target: ".gitignore",
    action: "update",
    detail: "axm:instructions markers",
  },
];

const renderSetupPlan = (rows: ReadonlyArray<SetupPlanRow>) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    yield* renderer.info(`Plan ·Review·`);
    for (const row of rows) {
      yield* renderer.info(`  ${row.target}  ${row.action}  ${row.detail}`);
    }
  });

const selectSetupAgents = (args: {
  readonly options: WorkspaceMutationsOptions;
  readonly existingSettings: Settings;
  readonly workspaceRoot: string;
}) =>
  Effect.gen(function* () {
    const nonInteractive = yield* isNonInteractive;
    const renderer = yield* CliRenderer;
    const requested = args.options.agents;
    if (requested !== undefined && requested.length > 0) {
      const selected = requested.flatMap((id) =>
        isKnownConfigurableAgentId(id) ? [AGENTS[id]] : [],
      );
      const unrecognized = requested.filter((id) => !isKnownConfigurableAgentId(id));
      if (unrecognized.length > 0) {
        yield* renderer.warn(
          `Unrecognized agent(s): ${unrecognized.join(", ")}. Use 'axm setup --help' to see available agents.`,
        );
      }
      return selected;
    }

    const detectedAgents = yield* detectAgents(args.workspaceRoot).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to detect agents: ${error.message}`,
          cause: error,
        }),
      ),
    );
    const detectedIds = Array.map(detectedAgents, (agent) => agent.id);
    yield* renderer.info(
      `Scanned this repo and your machine - found ${String(detectedIds.length)} agents.`,
    );
    yield* renderer.info(SETUP_PHASES);

    if (nonInteractive || args.options.yes === true) return detectedAgents;

    const interaction = yield* Effect.serviceOption(WorkspaceInitializationInteraction);
    const configuredIds = args.existingSettings.agents ?? [];
    const preferredIds =
      detectedIds.length === 0 && configuredIds.length === 0
        ? POPULAR_AGENT_IDS
        : [...configuredIds, ...detectedIds];
    const selectedIds = Option.isSome(interaction)
      ? yield* interaction.value.selectAgents({
          allAgents: allAgentDescriptors(preferredIds),
          detectedIds,
          configuredIds,
        })
      : yield* SELECT_AGENTS_PROMPT_MISSING;

    return selectedIds.flatMap((id) => (isKnownConfigurableAgentId(id) ? [AGENTS[id]] : []));
  });

const resolveInstructionSetup = (args: {
  readonly options: WorkspaceMutationsOptions;
  readonly existingSettings: Settings;
  readonly workspaceRoot: string;
}) =>
  Effect.gen(function* () {
    const nonInteractive = yield* isNonInteractive;
    const interaction = yield* Effect.serviceOption(WorkspaceInitializationInteraction);
    const defaultSyncEnabled = currentInstructionSyncEnabled(args.existingSettings);
    const syncEnabled =
      nonInteractive || args.options.yes === true
        ? true
        : Option.isSome(interaction)
          ? yield* interaction.value.confirmInstructionSync({ enabled: defaultSyncEnabled })
          : defaultSyncEnabled;
    const defaultFileName = currentInstructionFileName(args.existingSettings);
    const choices = yield* instructionSourceChoices(args.workspaceRoot, defaultFileName);
    const selectedFileName =
      syncEnabled && !nonInteractive && args.options.yes !== true && Option.isSome(interaction)
        ? yield* interaction.value.selectInstructionSource({
            defaultFileName,
            choices: choices.map(({ fileName, exists, lines }) => ({ fileName, exists, lines })),
          })
        : defaultFileName;

    return {
      enabled: syncEnabled,
      fileName: selectedFileName.trim().length > 0 ? selectedFileName.trim() : defaultFileName,
      choices,
    };
  });

const applyProjectSetup = (args: {
  readonly localDir: string;
  readonly workspaceRoot: string;
  readonly settings: Settings;
  readonly sourceFileName: string;
  readonly sourceContent: Option.Option<string>;
  readonly syncInstructions: boolean;
  readonly force: boolean;
  readonly dryRun: boolean;
}) =>
  Effect.gen(function* () {
    if (args.dryRun) return;
    const path = yield* Path.Path;
    yield* writeSettings(args.localDir, args.settings);
    const lockfilePath = path.join(args.localDir, LOCKFILE_NAME);
    const lockfileExists = yield* fileExists(lockfilePath);
    if (!lockfileExists) {
      yield* writeLockfile(args.localDir, { lockfileVersion: LOCKFILE_VERSION, skills: {} });
    }
    if (!args.syncInstructions) return;
    yield* writeSourceFileIfMissing({
      workspaceRoot: args.workspaceRoot,
      fileName: args.sourceFileName,
      content: args.sourceContent,
      dryRun: args.dryRun,
    });
    yield* syncInstructions({
      workspaceRoot: args.workspaceRoot,
      configuredAgents: args.settings.agents ?? [],
      config: { fileName: args.sourceFileName, gitignore: DEFAULT_INSTRUCTIONS_GITIGNORE },
      force: args.force,
      dryRun: args.dryRun,
    });
  });

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
        projectRoot: makeAbsolutePath(path, projectRoot),
        userHome: makeAbsolutePath(path, userHome),
        allowedRoot: makeAbsolutePath(path, "/"),
      }),
      AgentRootResolverLive.pipe(Layer.provide(platformLayer)),
    );
    return yield* makeWorkspaceReadModel(scope).pipe(
      Effect.flatMap((readModel) => readModel.state.settings),
      Effect.provide(env),
      Effect.mapError((error) =>
        makeAppError({
          code: "validation",
          detail: "Workspace settings could not be read",
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
const configureProjectWorkspace = (args: {
  readonly localDir: string;
  readonly options: WorkspaceMutationsOptions;
  readonly existingSettings: Settings;
  readonly settingsAction: "create" | "update";
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const workspaceRoot = path.dirname(args.localDir);
    const nonInteractive = yield* isNonInteractive;
    const requestedAgents = args.options.agents ?? [];
    const shouldReuseExistingSettings =
      args.settingsAction === "update" &&
      requestedAgents.length === 0 &&
      args.options.force !== true &&
      args.options.preview !== true &&
      (args.options.yes === true || nonInteractive);
    if (shouldReuseExistingSettings) {
      return args.existingSettings;
    }

    const selectedAgents = yield* selectSetupAgents({
      options: args.options,
      existingSettings: args.existingSettings,
      workspaceRoot,
    });
    const instructionSetup = yield* resolveInstructionSetup({
      options: args.options,
      existingSettings: args.existingSettings,
      workspaceRoot,
    });
    const agentIds = selectedAgents.flatMap((agent) =>
      isConfigurableAgentId(agent.id) ? [agent.id] : [],
    );
    const settings: Settings = {
      ...args.existingSettings,
      agents: agentIds,
      skills: args.existingSettings.skills ?? DEFAULT_SETUP_SKILLS,
      rulesConfig: {
        ...(args.existingSettings.rulesConfig ?? {}),
        instructions: instructionSetup.enabled
          ? {
              fileName: instructionSetup.fileName,
              gitignore: DEFAULT_INSTRUCTIONS_GITIGNORE,
            }
          : false,
      },
    };
    const sourceContent = sourceContentForApply({
      selectedFileName: instructionSetup.fileName,
      choices: instructionSetup.choices,
    });
    const sourceSeed = Option.isSome(sourceContent)
      ? richestExistingInstructionFile(instructionSetup.choices)
      : Option.none<SetupInstructionSourceChoice>();
    const sourceWillBeCreated = Option.isSome(sourceContent);
    const planRows = instructionSetup.enabled
      ? instructionPlanRows({
          selectedAgents,
          sourceFileName: instructionSetup.fileName,
          sourceWillBeCreated,
          sourceSeed,
        })
      : [
          {
            target: "rulesConfig",
            action: "skip",
            detail: "instructions disabled",
          } satisfies SetupPlanRow,
        ];
    yield* renderSetupPlan([
      {
        target: SETTINGS_FILENAME,
        action: args.settingsAction,
        detail: `agents: ${agentIds.join(", ")}`,
      },
      ...planRows,
    ]);
    const interaction = yield* Effect.serviceOption(WorkspaceInitializationInteraction);
    const confirmed =
      args.options.preview === true ||
      args.options.yes === true ||
      nonInteractive ||
      Option.isNone(interaction)
        ? true
        : yield* interaction.value.confirmSetupPlan();
    if (!confirmed) {
      return args.existingSettings;
    }
    yield* applyProjectSetup({
      localDir: args.localDir,
      workspaceRoot,
      settings,
      sourceFileName: instructionSetup.fileName,
      sourceContent,
      syncInstructions: instructionSetup.enabled,
      force: args.options.force ?? false,
      dryRun: args.options.preview ?? false,
    });
    return settings;
  });

export const initializeProjectWorkspace = (localDir: string, options: WorkspaceMutationsOptions) =>
  configureProjectWorkspace({
    localDir,
    options,
    existingSettings: createDefaultSettings(),
    settingsAction: "create",
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
          code: "validation",
          detail: `Failed to check if settings file exists: ${settingsPath}`,
          cause: error,
        }),
      ),
    );
    const lockfileExists = yield* fs.exists(lockfilePath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "validation",
          detail: `Failed to check if lockfile exists: ${lockfilePath}`,
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
      yield* writeLockfile(globalDir, { lockfileVersion: LOCKFILE_VERSION, skills: {} });
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

    const settings = yield* configureProjectWorkspace({
      localDir,
      options,
      existingSettings: localSettingsResult.settings,
      settingsAction: "update",
    });
    return { settings, initialized: false as const };
  });

export const bootstrapWorkspace = (options: WorkspaceMutationsOptions) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const location: WorkspaceLocation = yield* locateWorkspace(options.scope, options.projectRoot);
    const workspaceDir = location.path;

    if (options.scope === "user") {
      if (options.preview === true) {
        const localDir = yield* getAxmDir("project", options.projectRoot);
        const settings = yield* readSettingsFromReadModel(
          "user",
          path.dirname(localDir),
          path.dirname(workspaceDir),
        ).pipe(Effect.map(Option.getOrElse(() => createDefaultSettings())));
        return { settings, location, initialized: false };
      }
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
