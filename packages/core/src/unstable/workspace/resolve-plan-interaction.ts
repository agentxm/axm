import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/ServiceMap";
import * as Terminal from "effect/Terminal";
import { Prompt } from "effect/unstable/cli";
import type { AppError } from "../app-error/index.js";
import { runPrompt } from "../cli/prompt/index.js";
import type { PromptCancelled } from "../cli-prompt/prompt-cancelled.js";

const confirmApplyChangesMessage = "Apply changes?";

export interface ResolvePlanInteractionService {
  readonly confirmApplyChanges: () => Effect.Effect<boolean, PromptCancelled | AppError>;
}

export class ResolvePlanInteraction extends ServiceMap.Service<
  ResolvePlanInteraction,
  ResolvePlanInteractionService
>()("@axm.sh/workspace/ResolvePlanInteraction") {}

export const ResolvePlanInteractionLive = Layer.effect(
  ResolvePlanInteraction,
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
      confirmApplyChanges: () =>
        runPrompt(Prompt.confirm({ message: confirmApplyChangesMessage })).pipe(
          Effect.provide(promptEnvironment),
        ),
    } satisfies ResolvePlanInteractionService;
  }),
);

export interface ResolvePlanInteractionTestState {
  readonly confirmApplyChangesCalls: Array<null>;
}

export const ResolvePlanInteractionTest = (overrides?: {
  readonly confirmApplyChanges?: () => Effect.Effect<boolean, PromptCancelled | AppError>;
}) => {
  const state: ResolvePlanInteractionTestState = {
    confirmApplyChangesCalls: [],
  };

  const layer = Layer.succeed(ResolvePlanInteraction, {
    confirmApplyChanges: () =>
      Effect.gen(function* () {
        state.confirmApplyChangesCalls.push(null);
        return yield* overrides?.confirmApplyChanges?.() ?? Effect.succeed(true);
      }),
  } satisfies ResolvePlanInteractionService);

  return { layer, state };
};
