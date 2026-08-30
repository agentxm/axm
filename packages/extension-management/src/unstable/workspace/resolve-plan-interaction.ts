import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import * as Terminal from "effect/Terminal";
import { Prompt } from "effect/unstable/cli";
import type { AppError } from "../app-error/index.js";
import { requireInteractive } from "../cli/prompt/index.js";
import {
  confirmationRecoverySuggestions,
  type ConfirmationRecovery,
} from "../cli-runtime/confirmation-recovery.js";
import type { PromptCancelled } from "../cli-prompt/prompt-cancelled.js";

const confirmApplyChangesMessage = "Apply changes?";

export interface ResolvePlanInteractionService {
  readonly confirmApplyChanges: (
    recovery: ConfirmationRecovery,
  ) => Effect.Effect<boolean, PromptCancelled | AppError>;
}

export class ResolvePlanInteraction extends ServiceMap.Service<
  ResolvePlanInteraction,
  ResolvePlanInteractionService
>()(
  "@agentxm/extension-management/unstable/workspace/resolve-plan-interaction/ResolvePlanInteraction",
) {}

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
      confirmApplyChanges: (recovery) =>
        requireInteractive(Prompt.confirm({ message: confirmApplyChangesMessage }), {
          message: confirmApplyChangesMessage,
          suggestions: confirmationRecoverySuggestions(recovery),
        }).pipe(Effect.provide(promptEnvironment)),
    } satisfies ResolvePlanInteractionService;
  }),
);

export interface ResolvePlanInteractionTestState {
  readonly confirmApplyChangesCalls: Array<ConfirmationRecovery>;
}

export const ResolvePlanInteractionTest = (overrides?: {
  readonly confirmApplyChanges?: (
    recovery: ConfirmationRecovery,
  ) => Effect.Effect<boolean, PromptCancelled | AppError>;
}) => {
  const state: ResolvePlanInteractionTestState = {
    confirmApplyChangesCalls: [],
  };

  const layer = Layer.succeed(ResolvePlanInteraction, {
    confirmApplyChanges: (recovery) =>
      Effect.gen(function* () {
        state.confirmApplyChangesCalls.push(recovery);
        return yield* overrides?.confirmApplyChanges?.(recovery) ?? Effect.succeed(true);
      }),
  } satisfies ResolvePlanInteractionService);

  return { layer, state };
};
