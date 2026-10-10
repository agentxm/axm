/**
 * Workspace initialization logic.
 *
 * Handles initial setup of project and user-scope workspaces: agent detection,
 * interactive agent selection, and settings/lockfile creation.
 *
 * @internal
 */

import { resolveNativeEntry, resolveNativeReferent } from "@agentxm/workspace-kernel/locations";
import { setupSkillTargets } from "./skill-targets.js";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { CONFIGURABLE_AGENTS_BY_ID } from "@agentxm/extension-model/unstable/agent-capabilities/catalog";
import {
  detectAgentScopeResults,
  NativeWriteAuthority,
  type AgentScopeDetection,
} from "@agentxm/workspace-kernel/agent-adapters";
import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import { isConfigurableAgentId } from "@agentxm/extension-model/unstable/agent-capabilities/identity";
import {
  type AgentDescriptor,
  type MaterializationTargetId,
  type ConfigurableAgentId,
} from "@agentxm/extension-model/unstable/agents/types";
import { WorkspaceConfigurationFailed } from "../errors.js";
import { isGitManaged } from "@agentxm/workspace-kernel/sources";
import {
  LOCKFILE_NAME,
  SETTINGS_FILENAME,
} from "@agentxm/extension-model/unstable/workspace-files";
import {
  LOCKFILE_VERSION,
  ensureWorkspaceTransientIgnores,
  writeLockfileAtPath,
  createDefaultSettings,
  type Settings,
  writeSettingsAtPath,
  type WorkspaceStateOptions,
  AgentRootResolverLive,
  makeWorkspaceReadModel,
  WorkspaceReadModelConfig,
  type LocatedWorkspace,
  locateWorkspace,
  resolveUserHome,
  LOCK_FILENAME,
} from "@agentxm/workspace-kernel/workspace-state";
import { makeAbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  WorkspaceInitializationInteraction,
  type SetupPlanAction,
  type SetupPlanRow,
  type WorkspaceInitializationInteractionService,
} from "./initialization-interaction.js";
import { protectWorkspacePath, recordFootprint } from "@agentxm/workspace-kernel/settlement";
import {
  resolveInstructionTarget,
  observeInstructionProjection,
  syncInstructions,
  type InstructionMechanism,
} from "@agentxm/workspace-kernel/projection";

const SELECT_AGENTS_PROMPT_MISSING = new WorkspaceConfigurationFailed({
  category: "usage",
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

const isKnownAgentId = (id: string): id is MaterializationTargetId =>
  Object.hasOwn(AGENT_DESCRIPTORS, id);

const isKnownConfigurableAgentId = (id: string): id is ConfigurableAgentId =>
  isKnownAgentId(id) && isConfigurableAgentId(id);

const isAutoSelectableAgent = (agent: AgentDescriptor): boolean =>
  CONFIGURABLE_AGENTS_BY_ID[agent.id].lifecycle.state !== "retired";

const allAgentDescriptors = (
  preferredIds: ReadonlyArray<string>,
): ReadonlyArray<AgentDescriptor> => {
  // Preference sources overlap by design — configuration, detection, and the
  // catalog suggestion name the same agent — so the offer is ordered by first
  // mention and carries each agent once.
  const preferred = [...new Set(preferredIds)].flatMap((id) =>
    isKnownConfigurableAgentId(id) ? [AGENT_DESCRIPTORS[id]] : [],
  );
  const preferredSet = new Set(preferred.map((agent) => agent.id));
  const remaining = Object.values(AGENT_DESCRIPTORS).filter(
    (agent) => isConfigurableAgentId(agent.id) && !preferredSet.has(agent.id),
  );
  return [...preferred, ...remaining];
};

/**
 * What a first install offers when its project names no coding agent: every
 * configurable agent once, those found on the workstation first and suggested,
 * or the popular agents suggested when the workstation has none either.
 */
export const undetectedAgentOffer = (detections: ReadonlyArray<AgentScopeDetection>) => {
  const userDetectedIds = detections.flatMap(({ agent, user }) =>
    user && isAutoSelectableAgent(agent) ? [agent.id] : [],
  );
  const suggestedIds = userDetectedIds.length === 0 ? [...POPULAR_AGENT_IDS] : userDetectedIds;
  return {
    allAgents: allAgentDescriptors(suggestedIds),
    detectedIds: userDetectedIds,
    projectDetectedIds: [],
    userDetectedIds,
    suggestedIds,
    configuredIds: [],
  } satisfies Parameters<WorkspaceInitializationInteractionService["selectAgents"]>[0];
};

/**
 * Configured membership as a set, in selection order.
 *
 * An explicit request and a selection each reach setup as a sequence, so
 * either can name one agent more than once; the settings contract records
 * each configured agent once.
 */
const configuredAgentIds = (
  selectedAgents: ReadonlyArray<AgentDescriptor>,
): ReadonlyArray<ConfigurableAgentId> => [
  ...new Set(
    selectedAgents.flatMap((agent) => (isConfigurableAgentId(agent.id) ? [agent.id] : [])),
  ),
];

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
    const agent = AGENT_DESCRIPTORS[id];
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
      // eslint-disable-next-line axm-policy/no-unbounded-io -- fixed instruction-source filename list
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
    const content = args.content.value;
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const filePath = path.join(args.workspaceRoot, args.fileName);
    const exists = yield* fileExists(filePath);
    if (exists) return Option.none<string>();
    if (!args.dryRun) {
      const authority = yield* NativeWriteAuthority;
      yield* Effect.uninterruptible(
        Effect.gen(function* () {
          yield* protectWorkspacePath(filePath);
          yield* authority.createParentDirectories(filePath).pipe(
            Effect.mapError(
              (error) =>
                new WorkspaceConfigurationFailed({
                  category: "internal",
                  detail: `Failed to create instruction source directory: ${path.dirname(filePath)}`,
                  cause: error,
                }),
            ),
          );
          yield* fs.writeFileString(filePath, content).pipe(
            Effect.mapError(
              (error) =>
                new WorkspaceConfigurationFailed({
                  category: "internal",
                  detail: `Failed to write instruction source file: ${filePath}`,
                  cause: error,
                }),
            ),
          );
          yield* recordFootprint({ path: filePath, change: "created" });
        }),
      );
    }
    return Option.some(filePath);
  });

const instructionPlanAction = (mechanism: InstructionMechanism): SetupPlanAction => {
  switch (mechanism) {
    case "native":
      return "in sync";
    case "symlink":
      return "link";
    case "copy":
      return "copy";
    case "adapter":
    case "none":
      return "skip";
  }
};

const instructionPlanRows = (args: {
  readonly workspaceRoot: string;
  readonly selectedAgents: ReadonlyArray<AgentDescriptor>;
  readonly sourceFileName: string;
  readonly sourceWillBeCreated: boolean;
  readonly sourceSeed: Option.Option<SetupInstructionSourceChoice>;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const snapshot = yield* observeInstructionProjection({
      workspaceRoot: args.workspaceRoot,
      scope: "project",
      configuredAgents: args.selectedAgents.map((agent) => agent.id),
      config: { fileName: args.sourceFileName, gitignoreAliases: DEFAULT_INSTRUCTIONS_GITIGNORE },
      prospectiveRoots: [args.workspaceRoot],
    });
    const rows: Array<SetupPlanRow> = [
      {
        target: args.sourceFileName,
        action: args.sourceWillBeCreated ? "create" : "in sync",
        detail: Option.match(args.sourceSeed, {
          onNone: () => ({ _tag: "instructionSource" }) as const,
          onSome: (choice) => ({ _tag: "instructionSource", seededFrom: choice.fileName }) as const,
        }),
      },
    ];
    for (const item of snapshot.status.items) {
      if (item.mechanism === "none" || item.mechanism === "adapter") continue;
      const target = path.relative(args.workspaceRoot, item.targetFile);
      if (rows.some((row) => row.target === target)) continue;
      const seeded = Option.isSome(args.sourceSeed) && args.sourceSeed.value.fileName === target;
      rows.push({
        target,
        action:
          !seeded && (item.ownership === "unowned" || item.ownership === "owned-current")
            ? "in sync"
            : instructionPlanAction(item.mechanism),
        detail: {
          _tag: "instructionTarget",
          agentName: item.agentName,
          ...(seeded
            ? { seededAlias: true }
            : item.ownership === "unowned"
              ? { preserved: true }
              : {}),
        },
      });
    }
    for (const item of snapshot.status.staleTargets)
      rows.push({
        target: path.relative(args.workspaceRoot, item.targetFile),
        action: "remove",
        detail: { _tag: "instructionTarget", agentName: item.agentName },
      });
    return rows;
  });

const selectSetupAgents = (args: {
  readonly options: WorkspaceStateOptions;
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
        return yield* new WorkspaceConfigurationFailed({
          category: "validation",
          detail: `Unrecognized setup ${label}: ${unrecognized.join(", ")}`,
          suggestions: [{ description: "Show available setup agents.", cmd: "axm setup --help" }],
        });
      }
    }
    const detections = yield* detectAgentScopeResults(args.workspaceRoot).pipe(
      Effect.mapError((error) =>
        error._tag === "ConfigError"
          ? error
          : new WorkspaceConfigurationFailed({
              category: "internal",
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
        isKnownConfigurableAgentId(id) ? [AGENT_DESCRIPTORS[id]] : [],
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
        isKnownConfigurableAgentId(id) ? [AGENT_DESCRIPTORS[id]] : [],
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
      isKnownConfigurableAgentId(id) ? [AGENT_DESCRIPTORS[id]] : [],
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
  readonly options: WorkspaceStateOptions;
  readonly existingSettings: Settings;
  readonly workspaceRoot: string;
}) =>
  Effect.gen(function* () {
    // Unattended resolution takes the documented defaults: instruction sync
    // on, sourced from the default file. A preview resolves the same inputs
    // an approved unattended apply would, so it never asks and its candidate
    // is identical with or without preapproval.
    const unattended =
      args.options.nonInteractive === true ||
      args.options.yes === true ||
      args.options.preview === true;
    const interaction = yield* Effect.serviceOption(WorkspaceInitializationInteraction);
    const defaultSyncEnabled = currentInstructionSyncEnabled(args.existingSettings);
    const syncEnabled = unattended
      ? true
      : Option.isSome(interaction)
        ? yield* interaction.value.confirmInstructionSync({ enabled: defaultSyncEnabled })
        : defaultSyncEnabled;
    const defaultFileName = currentInstructionFileName(args.existingSettings);
    const choices = yield* instructionSourceChoices(args.workspaceRoot, defaultFileName);
    const selectedFileName =
      syncEnabled && !unattended && Option.isSome(interaction)
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
  readonly sourceSeed: Option.Option<SetupInstructionSourceChoice>;
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
    if (yield* isGitManaged(args.workspaceRoot))
      yield* ensureWorkspaceTransientIgnores(args.workspaceRoot);
    if (!args.syncInstructions) return;
    yield* writeSourceFileIfMissing({
      workspaceRoot: args.workspaceRoot,
      fileName: args.sourceFileName,
      content: args.sourceContent,
      dryRun: args.dryRun,
    });
    // Approval covers only the file that supplied the new canonical source.
    // Recheck both files immediately before replacing that regular file.
    const seededAlias =
      Option.isSome(args.sourceSeed) && args.sourceSeed.value.fileName !== args.sourceFileName
        ? args.sourceSeed.value
        : undefined;
    const aliasPath =
      seededAlias === undefined ? undefined : path.join(args.workspaceRoot, seededAlias.fileName);
    const replacesAlias =
      seededAlias !== undefined &&
      (args.settings.agents ?? []).some((id) => {
        const resolution = resolveInstructionTarget({
          instructions: AGENT_DESCRIPTORS[id].instructions,
          sourceFileName: args.sourceFileName,
          symlinkSupported: true,
        });
        return resolution.action === "write" && resolution.relativeTarget === seededAlias.fileName;
      });
    if (replacesAlias && aliasPath !== undefined) {
      const fs = yield* FileSystem.FileSystem;
      const safe = yield* Effect.gen(function* () {
        const entry = yield* resolveNativeEntry(aliasPath);
        const original = yield* fs.readFile(aliasPath);
        const canonical = yield* fs.readFile(path.join(args.workspaceRoot, args.sourceFileName));
        const expected = Option.map(args.sourceContent, (content) =>
          new TextEncoder().encode(content),
        );
        return (
          entry.kind === "file" &&
          Option.isSome(expected) &&
          original.length === canonical.length &&
          original.every((byte, index) => canonical[index] === byte) &&
          expected.value.length === original.length &&
          original.every((byte, index) => expected.value[index] === byte)
        );
      }).pipe(
        Effect.mapError(
          (cause) =>
            new WorkspaceConfigurationFailed({
              category: "conflict",
              detail: "Could not verify the instruction source before migration",
              cause,
            }),
        ),
      );
      if (!safe)
        return yield* new WorkspaceConfigurationFailed({
          category: "conflict",
          detail: "Instruction content changed after setup planning; preview setup again",
        });
      yield* protectWorkspacePath(aliasPath);
      yield* fs.remove(aliasPath).pipe(
        Effect.mapError(
          (cause) =>
            new WorkspaceConfigurationFailed({
              category: "internal",
              detail: "Could not replace the seeded instruction file",
              cause,
            }),
        ),
      );
      yield* recordFootprint({ path: aliasPath, change: "removed" });
    }
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
    if (replacesAlias && aliasPath !== undefined)
      yield* recordFootprint({ path: aliasPath, change: "modified" });
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
        // This boundary reads settings only; native scanners are not invoked.
        nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
        projectRoot: makeAbsolutePath(path, projectRoot),
        userHome: makeAbsolutePath(path, userHome),
        allowedRoot: makeAbsolutePath(path, "/"),
      }),
      AgentRootResolverLive.pipe(Layer.provide(platformLayer)),
    );
    return yield* makeWorkspaceReadModel(scope).pipe(
      Effect.flatMap((readModel) => readModel.state.settings),
      Effect.provide(env),
      Effect.mapError(
        (error) =>
          new WorkspaceConfigurationFailed({
            category: "validation",
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
 * @param options - workspace-state options
 * @returns Effect yielding selected agent IDs
 */
const configureProjectWorkspace = (args: {
  readonly localDir: string;
  readonly options: WorkspaceStateOptions;
  readonly existingSettings: Settings;
  /**
   * A workspace that exists keeps the membership and extensions it declares:
   * setup settles only the instruction choice it has not made yet.
   */
  readonly completing?: boolean;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const workspaceRoot = yield* resolveNativeReferent(path.dirname(args.localDir));
    const nonInteractive = args.options.nonInteractive === true;
    const completing = args.completing === true;
    const selection: SetupAgentSelection = completing
      ? {
          selectedAgents: (args.existingSettings.agents ?? []).flatMap((id) =>
            isKnownConfigurableAgentId(id) ? [AGENT_DESCRIPTORS[id]] : [],
          ),
          candidates: [],
        }
      : yield* selectSetupAgents({
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
    const agentIds = configuredAgentIds(selectedAgents);
    const settings: Settings = {
      ...args.existingSettings,
      ...(completing
        ? {}
        : { agents: agentIds, skills: args.existingSettings.skills ?? DEFAULT_SETUP_SKILLS }),
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
    // Declining instruction sync leaves every instruction file alone, so the
    // plan has nothing to say about them.
    const planRows = instructionSetup.enabled
      ? yield* instructionPlanRows({
          workspaceRoot,
          selectedAgents,
          sourceFileName: instructionSetup.fileName,
          sourceWillBeCreated,
          sourceSeed,
        })
      : [];
    const interaction = yield* Effect.serviceOption(WorkspaceInitializationInteraction);
    if (Option.isSome(interaction) && (!nonInteractive || args.options.preview === true)) {
      yield* interaction.value.presentSetupPlan([
        {
          target: SETTINGS_FILENAME,
          action: completing ? "update" : "create",
          detail: { _tag: "settings", agentIds },
        },
        ...(completing
          ? []
          : [
              {
                target: LOCK_FILENAME,
                action: (yield* fileExists(path.join(workspaceRoot, LOCK_FILENAME)))
                  ? "update"
                  : "create",
                detail: { _tag: "acceptedResolution" },
              } satisfies SetupPlanRow,
              ...(yield* setupSkillTargets(workspaceRoot, "project", agentIds)).map(
                (target): SetupPlanRow => ({
                  target: path.relative(workspaceRoot, target.path),
                  action: "create",
                  detail: { _tag: "bundledSkill" },
                }),
              ),
            ]),
        ...(gitManaged
          ? [
              {
                target: ".gitignore",
                action: (yield* fileExists(path.join(workspaceRoot, ".gitignore")))
                  ? "update"
                  : "create",
                detail: { _tag: "gitignore" },
              } satisfies SetupPlanRow,
            ]
          : []),
        ...planRows,
      ]);
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
        instructionPlan: planRows,
        confirmed: false,
      };
    }
    yield* applyProjectSetup({
      localDir: args.localDir,
      workspaceRoot,
      settings,
      sourceFileName: instructionSetup.fileName,
      sourceContent,
      sourceSeed,
      syncInstructions: instructionSetup.enabled,
      dryRun: args.options.preview ?? false,
    });
    return {
      settings,
      agentCandidates: selection.candidates,
      instructionPlan: planRows,
      confirmed: true,
    };
  });

export const initializeProjectWorkspace = (localDir: string, options: WorkspaceStateOptions) =>
  configureProjectWorkspace({
    localDir,
    options,
    existingSettings: createDefaultSettings(),
  });

const initializeUserWorkspace = (workspaceRoot: string, options: WorkspaceStateOptions) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const selection = yield* selectSetupAgents({
      options,
      existingSettings: createDefaultSettings(),
      workspaceRoot: options.projectRoot,
    });
    const selectedAgents = selection.selectedAgents;
    const agentIds = configuredAgentIds(selectedAgents);
    const settings: Settings = {
      agents: agentIds,
      skills: DEFAULT_SETUP_SKILLS,
    };
    const nativeRoot = yield* resolveNativeReferent(yield* resolveUserHome());
    const settingsRoot = yield* resolveNativeReferent(workspaceRoot);
    const nonInteractive = options.nonInteractive === true;
    const interaction = yield* Effect.serviceOption(WorkspaceInitializationInteraction);
    if (Option.isSome(interaction) && (!nonInteractive || options.preview === true)) {
      yield* interaction.value.presentSetupPlan([
        {
          target: path.relative(nativeRoot, path.join(settingsRoot, SETTINGS_FILENAME)),
          action: "create",
          detail: { _tag: "settings", agentIds },
        },
        {
          target: path.relative(nativeRoot, path.join(settingsRoot, LOCKFILE_NAME)),
          action: "create",
          detail: { _tag: "acceptedResolution" },
        },
        ...(yield* setupSkillTargets(nativeRoot, "user", agentIds)).map((target): SetupPlanRow => ({
          target: path.relative(nativeRoot, target.path),
          action: "create",
          detail: { _tag: "bundledSkill" },
        })),
      ]);
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
  /**
   * The run settled the instruction choice of a workspace that already
   * existed, or under a preview would settle it.
   */
  readonly completed: boolean;
  readonly cancelled: boolean;
  readonly agentCandidates: ReadonlyArray<SetupAgentCandidate>;
  readonly instructionPlan: ReadonlyArray<SetupPlanRow>;
}

const workspaceInitializationState = (
  settings: Settings,
  initialized: boolean,
  wouldInitialize: boolean,
  agentCandidates: ReadonlyArray<SetupAgentCandidate> = [],
  cancelled = false,
  instructionPlan: ReadonlyArray<SetupPlanRow> = [],
  completed = false,
): WorkspaceInitializationState => ({
  settings,
  initialized,
  wouldInitialize,
  completed,
  cancelled,
  agentCandidates,
  instructionPlan,
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
  options: WorkspaceStateOptions,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const settingsPath = path.join(workspaceRoot, SETTINGS_FILENAME);

    const settingsExists = yield* fs.exists(settingsPath).pipe(
      Effect.mapError(
        (error) =>
          new WorkspaceConfigurationFailed({
            category: "validation",
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
 * Whether setup has an instruction choice to settle in a workspace that
 * already exists. A workspace established by an unattended install records no
 * choice; setup asks for it where a person can answer, resolves the documented
 * default under preapproval or a preview, and otherwise leaves it open.
 */
const completesInstructionChoice = (settings: Settings, options: WorkspaceStateOptions): boolean =>
  settings.instructionFiles === undefined &&
  (options.nonInteractive !== true || options.yes === true || options.preview === true);

/**
 * Ensure project workspace is initialized, returning local settings.
 *
 * Reads existing local settings or runs the initialization flow when missing.
 *
 * @param localDir - Path to local .axm directory
 * @param options - workspace-state options
 * @returns Effect yielding local Settings
 */
export const ensureProjectWorkspaceInitialized = (
  localDir: string,
  options: WorkspaceStateOptions,
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
        false,
        initialization.instructionPlan,
      );
    }

    if (completesInstructionChoice(localSettingsResult.settings, options)) {
      const completion = yield* configureProjectWorkspace({
        localDir,
        options,
        existingSettings: localSettingsResult.settings,
        completing: true,
      });
      return workspaceInitializationState(
        completion.settings,
        false,
        completion.confirmed && options.preview === true,
        [],
        !completion.confirmed,
        completion.confirmed ? completion.instructionPlan : [],
        completion.confirmed && options.preview !== true,
      );
    }

    return workspaceInitializationState(localSettingsResult.settings, false, false);
  });

/** Whether this setup request would settle an existing project's instruction choice. */
export const setupCompletesInstructionChoice = (options: WorkspaceStateOptions) =>
  Effect.gen(function* () {
    if (options.scope !== "project") return false;
    const userHome = yield* resolveUserHome();
    const settings = yield* readSettingsFromReadModel("project", options.projectRoot, userHome);
    return Option.isSome(settings) && completesInstructionChoice(settings.value, options);
  });

export const bootstrapWorkspace = (options: WorkspaceStateOptions) =>
  Effect.gen(function* () {
    const location: LocatedWorkspace = yield* locateWorkspace(options.scope, options.projectRoot);
    const workspaceDir = location.path;

    if (options.scope === "user") {
      const result = yield* ensureUserWorkspaceInitialized(location.workspaceRoot, options);
      return { ...result, location };
    }

    const result = yield* ensureProjectWorkspaceInitialized(workspaceDir, options);
    return { ...result, location };
  });
