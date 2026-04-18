import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import * as Terminal from "effect/Terminal";
import { Prompt } from "effect/unstable/cli";
import type { AgentDescriptor } from "../agents/index.js";
import type { AppError } from "../app-error/index.js";
import { requireInteractive } from "../cli/prompt/index.js";
import type { PromptCancelled } from "../cli-prompt/prompt-cancelled.js";

const selectAgentsMessage = "Select agents to configure";

export interface WorkspaceInitializationInteractionService {
  readonly selectAgents: (options: {
    readonly allAgents: ReadonlyArray<AgentDescriptor>;
    readonly detectedIds: ReadonlyArray<string>;
  }) => Effect.Effect<ReadonlyArray<string>, PromptCancelled | AppError>;
}

export class WorkspaceInitializationInteraction extends ServiceMap.Service<
  WorkspaceInitializationInteraction,
  WorkspaceInitializationInteractionService
>()("@agentxm/workspace/WorkspaceInitializationInteraction") {}

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
      selectAgents: ({ allAgents, detectedIds }) =>
        requireInteractive(
          Prompt.multiSelect({
            message: selectAgentsMessage,
            choices: allAgents.map((agent) => ({
              title: agent.name,
              value: agent.id,
              description: `skills: ${agent.skills.dir}`,
              selected: detectedIds.includes(agent.id),
            })),
          }),
          { message: selectAgentsMessage },
        ).pipe(Effect.provide(promptEnvironment)),
    } satisfies WorkspaceInitializationInteractionService;
  }),
);

export interface WorkspaceInitializationInteractionTestState {
  readonly selectAgentsCalls: Array<{
    readonly allAgents: ReadonlyArray<AgentDescriptor>;
    readonly detectedIds: ReadonlyArray<string>;
  }>;
}

export const WorkspaceInitializationInteractionTest = (overrides?: {
  readonly selectAgents?: (options: {
    readonly allAgents: ReadonlyArray<AgentDescriptor>;
    readonly detectedIds: ReadonlyArray<string>;
  }) => Effect.Effect<ReadonlyArray<string>, PromptCancelled | AppError>;
}) => {
  const state: WorkspaceInitializationInteractionTestState = {
    selectAgentsCalls: [],
  };

  const layer = Layer.succeed(WorkspaceInitializationInteraction, {
    selectAgents: (options) =>
      Effect.gen(function* () {
        state.selectAgentsCalls.push(options);
        return yield* overrides?.selectAgents?.(options) ?? Effect.succeed([]);
      }),
  } satisfies WorkspaceInitializationInteractionService);

  return { layer, state };
};
