import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/ServiceMap";
import * as Terminal from "effect/Terminal";
import { Prompt } from "effect/unstable/cli";
import type { AppError } from "../app-error/index.js";
import { requireInteractive } from "../cli/prompt/index.js";
import type { PromptCancelled } from "../cli-prompt/prompt-cancelled.js";

const confirmLoginMessage = "You need to sign in to publish. Sign in now?";

export interface AuthGuardInteractionService {
  readonly confirmLogin: () => Effect.Effect<boolean, PromptCancelled | AppError>;
}

export class AuthGuardInteraction extends ServiceMap.Service<
  AuthGuardInteraction,
  AuthGuardInteractionService
>()("@axm.sh/cli/AuthGuardInteraction") {}

export const AuthGuardInteractionLive = Layer.effect(
  AuthGuardInteraction,
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
      confirmLogin: () =>
        requireInteractive(Prompt.confirm({ message: confirmLoginMessage }), {
          message: confirmLoginMessage,
        }).pipe(Effect.provide(promptEnvironment)),
    } satisfies AuthGuardInteractionService;
  }),
);

export interface AuthGuardInteractionTestState {
  readonly confirmLoginCalls: Array<null>;
}

export const AuthGuardInteractionTest = (overrides?: {
  readonly confirmLogin?: () => Effect.Effect<boolean, PromptCancelled | AppError>;
}) => {
  const state: AuthGuardInteractionTestState = {
    confirmLoginCalls: [],
  };

  const layer = Layer.succeed(AuthGuardInteraction, {
    confirmLogin: () =>
      Effect.gen(function* () {
        state.confirmLoginCalls.push(null);
        return yield* overrides?.confirmLogin?.() ?? Effect.succeed(true);
      }),
  } satisfies AuthGuardInteractionService);

  return { layer, state };
};
