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

import { CONFIGURABLE_AGENTS_BY_ID } from "@agentxm/extension-model/unstable/agent-capabilities/catalog";
import { detectAgentScopeResults, type AgentScopeDetection } from "@agentxm/agent-integration";
import { AGENTS } from "@agentxm/extension-model/unstable/agents/registry";
import {
  isConfigurableAgentId,
  type AgentDescriptor,
  type AgentId,
  type ConfigurableAgentId,
} from "@agentxm/extension-model/unstable/agents/types";
import { makeAppError } from "../app-error/index.js";
import { isGitManaged } from "@agentxm/extension-sources";
import { LOCKFILE_NAME } from "@agentxm/extension-model/unstable/workspace-files";
import { LOCKFILE_VERSION, writeLockfileAtPath } from "@agentxm/workspace-state";
import {
  createDefaultSettings,
  type Settings,
  writeSettingsAtPath,
} from "@agentxm/workspace-state";
import { makeAbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import type { WorkspaceMutationsOptions } from "@agentxm/workspace-state";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { AgentRootResolverLive } from "@agentxm/workspace-state";
import { makeWorkspaceReadModel, WorkspaceReadModelConfig } from "@agentxm/workspace-state";
import {
  WorkspaceInitializationInteraction,
  type SetupPlanRow,
} from "./initialization-interaction.js";
import { type WorkspaceLocation, locateWorkspace, resolveUserHome } from "@agentxm/workspace-state";
import { setupScopeSupport } from "@agentxm/workspace-state";
import { protectWorkspacePath } from "@agentxm/workspace-state";
import { LOCK_FILENAME } from "@agentxm/workspace-state";
import { SETTINGS_FILENAME } from "@agentxm/extension-model/unstable/workspace-files";
import { resolveInstructionTarget, syncInstructions } from "@agentxm/extension-workspace";
import type { InstructionMechanism } from "@agentxm/extension-workspace";

const SELECT_AGENTS_PROMPT_MISSING = makeAppError({
  code: "usage",
  detail: "Interactive prompt required: Select agents to configure",
  suggestions: [{ description: "Provide WorkspaceInitializationInteraction in the runtime." }],
});

const DEFAULT_INSTRUCTIONS_FILE = "AGENTS.md";
const DEFAULT_INSTRUCTIONS_GITIGNORE = true;
const POPULAR_AGENT_IDS = [
  "claude-code",
  "codex",
  "cursor",
  "github-copilot-cli",
  "opencode",
] as const;

export interface SetupAgentCandidate {
  readonly id: ConfigurableAgentId;
  readonly name: string;
  readonly projectDetected: boolean;
  readonly userDetected: boolean;
  readonly state: "selected" | "suggested" | "available" | "retired";
  readonly selectionReason?:
    "explicit" | "project-detected" | "user-detected" | "catalog-suggestion";
}

interface SetupAgentSelection {
  readonly selectedAgents: ReadonlyArray<AgentDescriptor>;
  readonly candidates: ReadonlyArray<SetupAgentCandidate>;
}
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

const isAutoSelectableAgent = (agent: AgentDescriptor): boolean =>
  agent.id === "universal" || CONFIGURABLE_AGENTS_BY_ID[agent.id].lifecycle.state !== "retired";

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

const setupAgentCandidates = (args: {
  readonly detections: ReadonlyArray<AgentScopeDetection>;
  readonly selectedAgents: ReadonlyArray<AgentDescriptor>;
  readonly suggestedIds: ReadonlyArray<ConfigurableAgentId>;
  readonly explicit: boolean;
  readonly scope: WorkspaceScope;
}): ReadonlyArray<SetupAgentCandidate> => {
  const selectedIds = new Set(args.selectedAgents.map((agent) => agent.id));
  const suggestedIds = new Set(args.suggestedIds);
  const detectionsById = new Map(
    args.detections.map((detection) => [detection.agent.id, detection]),
  );
  const relevantIds = [
    ...args.selectedAgents.map((agent) => agent.id),
    ...args.detections.map((detection) => detection.agent.id),
    ...args.suggestedIds,
  ];

  return [...new Set(relevantIds)].flatMap((id) => {
    if (!isKnownConfigurableAgentId(id)) return [];
    const agent = AGENTS[id];
    const detection = detectionsById.get(id);
    const projectDetected = detection?.project ?? false;
    const userDetected = detection?.user ?? false;
    const retired = !isAutoSelectableAgent(agent);
    const selected = selectedIds.has(id);
    const selectionReason = selected
      ? args.explicit
        ? "explicit"
        : args.scope === "project" && projectDetected
          ? "project-detected"
          : args.scope === "user" && userDetected
            ? "user-detected"
            : suggestedIds.has(id)
              ? "catalog-suggestion"
              : undefined
      : undefined;
    return [
      {
        id,
        name: agent.name,
        projectDetected,
        userDetected,
        state: retired
          ? "retired"
          : selected
            ? "selected"
            : suggestedIds.has(id)
              ? "suggested"
              : "available",
        ...(selectionReason === undefined ? {} : { selectionReason }),
      } satisfies SetupAgentCandidate,
    ];
  });
};

const DEFAULT_SETUP_SKILLS = {
  axm: {
    source: "workspace",
    enabled: true,
    origin: "bundled",
  },
} as const satisfies NonNullable<Settings["skills"]>;

interface SetupInstructionSourceChoice {
  readonly fileName: string;
  readonly exists: boolean;
  readonly lines: number;
  readonly content: Option.Option<string>;
}

const instructionValueFromSettings = (settings: Settings) => settings.instructionFiles;

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

const WORKSPACE_TRANSIENT_GITIGNORE_LINES = ["/.axm/", "*.axm-staging/", "*.axm-backup/"] as const;

const newlineFor = (content: string): "\r\n" | "\r" | "\n" =>
  content.includes("\r\n") ? "\r\n" : content.includes("\r") ? "\r" : "\n";

const ensureWorkspaceTransientIgnores = (workspaceRoot: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (!(yield* isGitManaged(workspaceRoot))) return;
    const filePath = path.join(workspaceRoot, ".gitignore");
    const exists = yield* fileExists(filePath);
    const current = exists
      ? yield* fs.readFileString(filePath).pipe(
          Effect.mapError((cause) =>
            makeAppError({
              code: "internal",
              detail: `Failed to read AXM workspace ignore file: ${filePath}`,
              cause,
            }),
          ),
        )
      : "";
    const newline = newlineFor(current);
    const existing = new Set(current.split(/\r\n|\r|\n/u));
    const missing = WORKSPACE_TRANSIENT_GITIGNORE_LINES.filter((line) => !existing.has(line));
    if (missing.length === 0) return;
    const hasTrailingNewline = current.endsWith("\n") || current.endsWith("\r");
    const prefix = current.length === 0 || hasTrailingNewline ? current : `${current}${newline}`;
    yield* protectWorkspacePath(filePath);
    yield* fs.writeFileString(filePath, `${prefix}${missing.join(newline)}${newline}`).pipe(
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: `Failed to write AXM workspace ignore file: ${filePath}`,
          cause,
        }),
      ),
    );
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
      yield* protectWorkspacePath(filePath);
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
    case "none":
      return "unsupported";
  }
};

const instructionPlanRows = (args: {
  readonly selectedAgents: ReadonlyArray<AgentDescriptor>;
  readonly sourceFileName: string;
  readonly sourceWillBeCreated: boolean;
  readonly sourceSeed: Option.Option<SetupInstructionSourceChoice>;
}): ReadonlyArray<SetupPlanRow> => {
  const rows: Array<SetupPlanRow> = [
    {
      target: args.sourceFileName,
      action: args.sourceWillBeCreated ? "create" : "in sync",
      detail: Option.match(args.sourceSeed, {
        onNone: () => "source",
        onSome: (choice) => `seeded from ${choice.fileName}`,
      }),
    },
    ...args.selectedAgents.map((agent) => {
      const resolution = resolveInstructionTarget({
        instructions: agent.instructions,
        sourceFileName: args.sourceFileName,
        symlinkSupported: true,
      });
      if (resolution.action === "skip") {
        return {
          target: agent.name,
          action: "skip",
          detail: "no instruction convention",
        } satisfies SetupPlanRow;
      }
      return {
        target: resolution.relativeTarget,
        action: instructionMechanismLabel(resolution.mechanism),
        detail: agent.name,
      } satisfies SetupPlanRow;
    }),
  ];
  return rows;
};

const selectSetupAgents = (args: {
  readonly options: WorkspaceMutationsOptions;
  readonly existingSettings: Settings;
  readonly workspaceRoot: string;
}) =>
  Effect.gen(function* () {
    const nonInteractive = args.options.nonInteractive === true;
    const interaction = yield* Effect.serviceOption(WorkspaceInitializationInteraction);
    const requested = args.options.agents;
    if (requested !== undefined && requested.length > 0) {
      const unrecognized = requested.filter((id) => !isKnownConfigurableAgentId(id));
      if (unrecognized.length > 0) {
        const label = unrecognized.length === 1 ? "agent" : "agents";
        return yield* makeAppError({
          code: "validation",
          detail: `Unrecognized setup ${label}: ${unrecognized.join(", ")}`,
          suggestions: [{ description: "Show available setup agents.", cmd: "axm setup --help" }],
        });
      }
    }
    const detections = yield* detectAgentScopeResults(args.workspaceRoot).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to detect agents: ${error.message}`,
          cause: error,
        }),
      ),
    );
    const detectedAgents = detections.map((detection) => detection.agent);
    const autoSelectableAgents = detectedAgents.filter(isAutoSelectableAgent);
    const retiredDetectedAgents = detectedAgents.filter((agent) => !isAutoSelectableAgent(agent));
    const detectedIds = Array.map(autoSelectableAgents, (agent) => agent.id);
    const projectDetectedIds = detections.flatMap(({ agent, project }) =>
      project && isAutoSelectableAgent(agent) ? [agent.id] : [],
    );
    const userDetectedIds = detections.flatMap(({ agent, user }) =>
      user && isAutoSelectableAgent(agent) ? [agent.id] : [],
    );
    if (requested !== undefined && requested.length > 0) {
      const selected = requested.flatMap((id) =>
        isKnownConfigurableAgentId(id) ? [AGENTS[id]] : [],
      );
      return {
        selectedAgents: selected,
        candidates: setupAgentCandidates({
          detections,
          selectedAgents: selected,
          suggestedIds: [],
          explicit: true,
          scope: args.options.scope,
        }),
      } satisfies SetupAgentSelection;
    }

    if (Option.isSome(interaction)) {
      yield* interaction.value.presentAgentScan({
        detectedCount: detectedAgents.length,
        retiredAgents: retiredDetectedAgents.map((agent) => ({
          id: agent.id,
          name: agent.name,
        })),
      });
    }

    const configuredIds = args.existingSettings.agents ?? [];
    const strongDetectedIds =
      args.options.scope === "project" ? projectDetectedIds : userDetectedIds;
    const suggestedIds =
      strongDetectedIds.length === 0 && configuredIds.length === 0 ? [...POPULAR_AGENT_IDS] : [];
    const preferredIds = [...configuredIds, ...strongDetectedIds, ...detectedIds, ...suggestedIds];
    const defaultIds = [...new Set([...configuredIds, ...strongDetectedIds, ...suggestedIds])];
    if (nonInteractive || args.options.yes === true || args.options.preview === true) {
      const selectedAgents = defaultIds.flatMap((id) =>
        isKnownConfigurableAgentId(id) ? [AGENTS[id]] : [],
      );
      return {
        selectedAgents,
        candidates: setupAgentCandidates({
          detections,
          selectedAgents,
          suggestedIds,
          explicit: false,
          scope: args.options.scope,
        }),
      } satisfies SetupAgentSelection;
    }

    const selectedIds = Option.isSome(interaction)
      ? yield* interaction.value.selectAgents({
          allAgents: allAgentDescriptors(preferredIds),
          detectedIds,
          projectDetectedIds,
          userDetectedIds,
          suggestedIds,
          configuredIds,
        })
      : yield* SELECT_AGENTS_PROMPT_MISSING;
    const selectedAgents = selectedIds.flatMap((id) =>
      isKnownConfigurableAgentId(id) ? [AGENTS[id]] : [],
    );
    return {
      selectedAgents,
      candidates: setupAgentCandidates({
        detections,
        selectedAgents,
        suggestedIds,
        explicit: false,
        scope: args.options.scope,
      }),
    } satisfies SetupAgentSelection;
  });

const resolveInstructionSetup = (args: {
  readonly options: WorkspaceMutationsOptions;
  readonly existingSettings: Settings;
  readonly workspaceRoot: string;
}) =>
  Effect.gen(function* () {
    const nonInteractive = args.options.nonInteractive === true;
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
  readonly dryRun: boolean;
}) =>
  Effect.gen(function* () {
    if (args.dryRun) return;
    const path = yield* Path.Path;
    const settingsPath = path.join(args.workspaceRoot, SETTINGS_FILENAME);
    const lockfilePath = path.join(args.workspaceRoot, LOCK_FILENAME);
    yield* writeSettingsAtPath(settingsPath, args.settings);
    const lockfileExists = yield* fileExists(lockfilePath);
    if (!lockfileExists) {
      yield* protectWorkspacePath(lockfilePath);
      yield* writeLockfileAtPath(lockfilePath, {
        lockfileVersion: LOCKFILE_VERSION,
        skills: {},
      });
    }
    yield* ensureWorkspaceTransientIgnores(args.workspaceRoot);
    if (!args.syncInstructions) return;
    yield* writeSourceFileIfMissing({
      workspaceRoot: args.workspaceRoot,
      fileName: args.sourceFileName,
      content: args.sourceContent,
      dryRun: args.dryRun,
    });
    yield* syncInstructions({
      workspaceRoot: args.workspaceRoot,
      scope: "project",
      configuredAgents: args.settings.agents ?? [],
      config: {
        fileName: args.sourceFileName,
        gitignoreAliases: DEFAULT_INSTRUCTIONS_GITIGNORE,
      },
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
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const workspaceRoot = path.dirname(args.localDir);
    const nonInteractive = args.options.nonInteractive === true;
    const selection = yield* selectSetupAgents({
      options: args.options,
      existingSettings: args.existingSettings,
      workspaceRoot,
    });
    const selectedAgents = selection.selectedAgents;
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
      instructionFiles: instructionSetup.enabled
        ? {
            fileName: instructionSetup.fileName,
            gitignoreAliases: DEFAULT_INSTRUCTIONS_GITIGNORE,
          }
        : false,
    };
    const sourceContent = sourceContentForApply({
      selectedFileName: instructionSetup.fileName,
      choices: instructionSetup.choices,
    });
    const sourceSeed = Option.isSome(sourceContent)
      ? richestExistingInstructionFile(instructionSetup.choices)
      : Option.none<SetupInstructionSourceChoice>();
    const sourceWillBeCreated = Option.isSome(sourceContent);
    const gitManaged = yield* isGitManaged(workspaceRoot);
    const planRows = instructionSetup.enabled
      ? instructionPlanRows({
          selectedAgents,
          sourceFileName: instructionSetup.fileName,
          sourceWillBeCreated,
          sourceSeed,
        })
      : [
          {
            target: "instructionFiles",
            action: "skip",
            detail: "instructions disabled",
          } satisfies SetupPlanRow,
        ];
    const interaction = yield* Effect.serviceOption(WorkspaceInitializationInteraction);
    if (Option.isSome(interaction) && (!nonInteractive || args.options.preview === true)) {
      yield* interaction.value.presentSetupPlan([
        {
          target: SETTINGS_FILENAME,
          action: "create",
          detail: `agents: ${agentIds.join(", ")}`,
        },
        ...(gitManaged
          ? [
              {
                target: ".gitignore",
                action: "update",
                detail: "AXM runtime and package transaction artifacts",
              } satisfies SetupPlanRow,
            ]
          : []),
        ...planRows,
      ]);
      if (args.options.preview !== true) {
        yield* interaction.value.presentScopeSupport(
          args.options.scope,
          setupScopeSupport(agentIds, args.options.scope),
        );
      }
    }
    const confirmed =
      args.options.preview === true ||
      args.options.yes === true ||
      nonInteractive ||
      Option.isNone(interaction)
        ? true
        : yield* interaction.value.confirmSetupPlan();
    if (!confirmed) {
      return {
        settings: args.existingSettings,
        agentCandidates: selection.candidates,
        confirmed: false,
      };
    }
    yield* applyProjectSetup({
      localDir: args.localDir,
      workspaceRoot,
      settings,
      sourceFileName: instructionSetup.fileName,
      sourceContent,
      syncInstructions: instructionSetup.enabled,
      dryRun: args.options.preview ?? false,
    });
    return { settings, agentCandidates: selection.candidates, confirmed: true };
  });

export const initializeProjectWorkspace = (localDir: string, options: WorkspaceMutationsOptions) =>
  configureProjectWorkspace({
    localDir,
    options,
    existingSettings: createDefaultSettings(),
  });

const initializeUserWorkspace = (workspaceRoot: string, options: WorkspaceMutationsOptions) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const selection = yield* selectSetupAgents({
      options,
      existingSettings: createDefaultSettings(),
      workspaceRoot: options.projectRoot,
    });
    const selectedAgents = selection.selectedAgents;
    const agentIds = selectedAgents.flatMap((agent) =>
      isConfigurableAgentId(agent.id) ? [agent.id] : [],
    );
    const settings: Settings = {
      agents: agentIds,
      skills: DEFAULT_SETUP_SKILLS,
    };
    const nonInteractive = options.nonInteractive === true;
    const interaction = yield* Effect.serviceOption(WorkspaceInitializationInteraction);
    if (Option.isSome(interaction) && (!nonInteractive || options.preview === true)) {
      yield* interaction.value.presentSetupPlan([
        {
          target: SETTINGS_FILENAME,
          action: "create",
          detail: `agents: ${agentIds.join(", ")}`,
        },
        {
          target: LOCKFILE_NAME,
          action: "create",
          detail: "accepted resolution",
        },
      ]);
      if (options.preview !== true) {
        yield* interaction.value.presentScopeSupport(
          options.scope,
          setupScopeSupport(agentIds, options.scope),
        );
      }
    }
    const confirmed =
      options.preview === true ||
      options.yes === true ||
      nonInteractive ||
      Option.isNone(interaction)
        ? true
        : yield* interaction.value.confirmSetupPlan();
    if (!confirmed) {
      return {
        settings: createDefaultSettings(),
        agentCandidates: selection.candidates,
        confirmed: false,
      };
    }
    if (options.preview !== true) {
      const settingsPath = path.join(workspaceRoot, SETTINGS_FILENAME);
      const lockPath = path.join(workspaceRoot, LOCKFILE_NAME);
      yield* protectWorkspacePath(lockPath);
      yield* writeSettingsAtPath(settingsPath, settings);
      yield* writeLockfileAtPath(lockPath, { lockfileVersion: LOCKFILE_VERSION, skills: {} });
    }
    return { settings, agentCandidates: selection.candidates, confirmed: true };
  });

interface WorkspaceInitializationState {
  readonly settings: Settings;
  readonly initialized: boolean;
  readonly wouldInitialize: boolean;
  readonly cancelled: boolean;
  readonly agentCandidates: ReadonlyArray<SetupAgentCandidate>;
}

const workspaceInitializationState = (
  settings: Settings,
  initialized: boolean,
  wouldInitialize: boolean,
  agentCandidates: ReadonlyArray<SetupAgentCandidate> = [],
  cancelled = false,
): WorkspaceInitializationState => ({
  settings,
  initialized,
  wouldInitialize,
  cancelled,
  agentCandidates,
});

/**
 * Ensure the user workspace has axm.json and axm-lock.yaml.
 *
 * Creates missing files with empty defaults.
 *
 * @param workspaceRoot - Path to the user workspace root
 */
export const ensureUserWorkspaceInitialized = (
  workspaceRoot: string,
  options: WorkspaceMutationsOptions,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const settingsPath = path.join(workspaceRoot, SETTINGS_FILENAME);

    const settingsExists = yield* fs.exists(settingsPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "validation",
          detail: `Failed to check if settings file exists: ${settingsPath}`,
          cause: error,
        }),
      ),
    );
    if (!settingsExists) {
      const initialization = yield* initializeUserWorkspace(workspaceRoot, options);
      if (!initialization.confirmed) {
        return workspaceInitializationState(
          initialization.settings,
          false,
          false,
          initialization.agentCandidates,
          true,
        );
      }
      return workspaceInitializationState(
        initialization.settings,
        options.preview !== true,
        options.preview === true,
        initialization.agentCandidates,
      );
    }

    const userHome = yield* resolveUserHome();
    const settings = yield* readSettingsFromReadModel("user", options.projectRoot, userHome).pipe(
      Effect.map(Option.getOrElse(() => createDefaultSettings())),
    );
    return workspaceInitializationState(settings, false, false);
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
    const userHome = yield* resolveUserHome();
    const localSettingsResult = yield* readSettingsFromReadModel(
      "project",
      path.dirname(localDir),
      userHome,
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
      const initialization = yield* initializeProjectWorkspace(localDir, options);
      if (!initialization.confirmed) {
        return workspaceInitializationState(
          initialization.settings,
          false,
          false,
          initialization.agentCandidates,
          true,
        );
      }
      return workspaceInitializationState(
        initialization.settings,
        options.preview !== true,
        options.preview === true,
        initialization.agentCandidates,
      );
    }

    return workspaceInitializationState(localSettingsResult.settings, false, false);
  });

export const bootstrapWorkspace = (options: WorkspaceMutationsOptions) =>
  Effect.gen(function* () {
    const location: WorkspaceLocation = yield* locateWorkspace(options.scope, options.projectRoot);
    const workspaceDir = location.path;

    if (options.scope === "user") {
      const result = yield* ensureUserWorkspaceInitialized(location.workspaceRoot, options);
      return { ...result, location };
    }

    const result = yield* ensureProjectWorkspaceInitialized(workspaceDir, options);
    return { ...result, location };
  });
