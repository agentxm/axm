import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import * as Terminal from "effect/Terminal";
import { Prompt } from "effect/unstable/cli";
import type { AgentDescriptor } from "../agents/index.js";
import type { AppError } from "../app-error/index.js";
import { autocompleteMultiselect, requireInteractive } from "../cli/prompt/index.js";
import type { PromptCancelled } from "../cli-prompt/prompt-cancelled.js";

const selectAgentsMessage = "Select agents to configure";
const confirmInstructionSyncMessage = "Sync a shared instructions file?";
const selectInstructionSourceMessage = "Source instructions file";
const customInstructionSourceMessage = "Source instructions file name";
const confirmSetupPlanMessage = "Proceed?";

const CUSTOM_SOURCE_FILE = "__custom__";

export interface InstructionSourceChoice {
  readonly fileName: string;
  readonly exists: boolean;
  readonly lines: number;
}

export interface WorkspaceInitializationInteractionService {
  readonly selectAgents: (options: {
    readonly allAgents: ReadonlyArray<AgentDescriptor>;
    readonly detectedIds: ReadonlyArray<string>;
    readonly configuredIds: ReadonlyArray<string>;
  }) => Effect.Effect<ReadonlyArray<string>, PromptCancelled | AppError>;
  readonly confirmInstructionSync: (options: {
    readonly enabled: boolean;
  }) => Effect.Effect<boolean, PromptCancelled | AppError>;
  readonly selectInstructionSource: (options: {
    readonly defaultFileName: string;
    readonly choices: ReadonlyArray<InstructionSourceChoice>;
  }) => Effect.Effect<string, PromptCancelled | AppError>;
  readonly confirmSetupPlan: () => Effect.Effect<boolean, PromptCancelled | AppError>;
}

export class WorkspaceInitializationInteraction extends ServiceMap.Service<
  WorkspaceInitializationInteraction,
  WorkspaceInitializationInteractionService
>()(
  "@agentxm/client-core/unstable/workspace/initialization-interaction/WorkspaceInitializationInteraction",
) {}

export const WorkspaceInitializationInteractionLive = Layer.effect(
  WorkspaceInitializationInteraction,
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const terminal = yield* Terminal.Terminal;
    const promptEnvironment = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fileSystem),
      Layer.succeed(Path.Path, path),
      Layer.succeed(Terminal.Terminal, terminal),
    );

    return {
      selectAgents: ({ allAgents, detectedIds, configuredIds }) =>
        requireInteractive(
          autocompleteMultiselect({
            message: selectAgentsMessage,
            choices: allAgents.map((agent) => ({
              title: agent.name,
              value: agent.id,
              description: [
                configuredIds.includes(agent.id) ? "configured" : undefined,
                detectedIds.includes(agent.id) ? "detected" : undefined,
                `skills: ${agent.skills.dir}`,
              ]
                .filter((part) => part !== undefined)
                .join(" · "),
              selected: configuredIds.includes(agent.id) || detectedIds.includes(agent.id),
            })),
          }),
          { message: selectAgentsMessage },
        ).pipe(Effect.provide(promptEnvironment)),
      confirmInstructionSync: ({ enabled }) =>
        requireInteractive(
          Prompt.confirm({ message: confirmInstructionSyncMessage, initial: enabled }),
          { message: confirmInstructionSyncMessage },
        ).pipe(Effect.provide(promptEnvironment)),
      selectInstructionSource: ({ defaultFileName, choices }) =>
        Effect.gen(function* () {
          const selected = yield* requireInteractive(
            Prompt.select({
              message: selectInstructionSourceMessage,
              choices: [
                ...choices.map((choice) => {
                  const description = choice.exists
                    ? `found in this repo · ${String(choice.lines)} lines`
                    : choice.fileName === defaultFileName
                      ? "standard · recommended"
                      : undefined;
                  return {
                    title: choice.fileName,
                    value: choice.fileName,
                    ...(description !== undefined && { description }),
                    selected: choice.fileName === defaultFileName,
                  };
                }),
                {
                  title: "Use a different name...",
                  value: CUSTOM_SOURCE_FILE,
                },
              ],
            }),
            { message: selectInstructionSourceMessage },
          ).pipe(Effect.provide(promptEnvironment));
          if (selected !== CUSTOM_SOURCE_FILE) return selected;
          return yield* requireInteractive(
            Prompt.text({ message: customInstructionSourceMessage }),
            { message: customInstructionSourceMessage },
          ).pipe(Effect.provide(promptEnvironment));
        }),
      confirmSetupPlan: () =>
        requireInteractive(Prompt.confirm({ message: confirmSetupPlanMessage, initial: true }), {
          message: confirmSetupPlanMessage,
        }).pipe(Effect.provide(promptEnvironment)),
    } satisfies WorkspaceInitializationInteractionService;
  }),
);

export interface WorkspaceInitializationInteractionTestState {
  readonly selectAgentsCalls: Array<{
    readonly allAgents: ReadonlyArray<AgentDescriptor>;
    readonly detectedIds: ReadonlyArray<string>;
    readonly configuredIds: ReadonlyArray<string>;
  }>;
  readonly confirmInstructionSyncCalls: Array<{ readonly enabled: boolean }>;
  readonly selectInstructionSourceCalls: Array<{
    readonly defaultFileName: string;
    readonly choices: ReadonlyArray<InstructionSourceChoice>;
  }>;
  readonly confirmSetupPlanCalls: Array<null>;
}

export const WorkspaceInitializationInteractionTest = (overrides?: {
  readonly selectAgents?: (options: {
    readonly allAgents: ReadonlyArray<AgentDescriptor>;
    readonly detectedIds: ReadonlyArray<string>;
    readonly configuredIds: ReadonlyArray<string>;
  }) => Effect.Effect<ReadonlyArray<string>, PromptCancelled | AppError>;
  readonly confirmInstructionSync?: (options: {
    readonly enabled: boolean;
  }) => Effect.Effect<boolean, PromptCancelled | AppError>;
  readonly selectInstructionSource?: (options: {
    readonly defaultFileName: string;
    readonly choices: ReadonlyArray<InstructionSourceChoice>;
  }) => Effect.Effect<string, PromptCancelled | AppError>;
  readonly confirmSetupPlan?: () => Effect.Effect<boolean, PromptCancelled | AppError>;
}) => {
  const state: WorkspaceInitializationInteractionTestState = {
    selectAgentsCalls: [],
    confirmInstructionSyncCalls: [],
    selectInstructionSourceCalls: [],
    confirmSetupPlanCalls: [],
  };

  const layer = Layer.succeed(WorkspaceInitializationInteraction, {
    selectAgents: (options) =>
      Effect.gen(function* () {
        state.selectAgentsCalls.push(options);
        return yield* overrides?.selectAgents?.(options) ??
          Effect.succeed([...new Set([...options.configuredIds, ...options.detectedIds])]);
      }),
    confirmInstructionSync: (options) =>
      Effect.gen(function* () {
        state.confirmInstructionSyncCalls.push(options);
        return yield* overrides?.confirmInstructionSync?.(options) ??
          Effect.succeed(options.enabled);
      }),
    selectInstructionSource: (options) =>
      Effect.gen(function* () {
        state.selectInstructionSourceCalls.push(options);
        return yield* overrides?.selectInstructionSource?.(options) ??
          Effect.succeed(options.defaultFileName);
      }),
    confirmSetupPlan: () =>
      Effect.gen(function* () {
        state.confirmSetupPlanCalls.push(null);
        return yield* overrides?.confirmSetupPlan?.() ?? Effect.succeed(true);
      }),
  } satisfies WorkspaceInitializationInteractionService);

  return { layer, state };
};
