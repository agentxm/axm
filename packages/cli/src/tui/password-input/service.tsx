import React from "react";
import { render } from "ink";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { PromptCancelled, PromptError } from "../errors.js";
import { PasswordInputPrompt } from "./component.js";
import type { PasswordInputConfig } from "./types.js";

export interface PasswordInputService {
  readonly prompt: (
    config: PasswordInputConfig,
  ) => Effect.Effect<string, PromptError | PromptCancelled>;
}

export class PasswordInput extends Context.Tag("@axm.sh/cli/tui/PasswordInput")<
  PasswordInput,
  PasswordInputService
>() {}

const makeLivePasswordInputService = (): PasswordInputService => ({
  prompt: (config) =>
    Effect.async<string, PromptError | PromptCancelled>((resume) => {
      try {
        const instance = render(
          <PasswordInputPrompt
            config={config}
            onSubmit={(value) => {
              instance.unmount();
              resume(Effect.succeed(value));
            }}
            onCancel={() => {
              instance.unmount();
              resume(Effect.fail(new PromptCancelled({ message: "Operation cancelled." })));
            }}
          />,
        );
      } catch (error) {
        resume(
          Effect.fail(
            new PromptError({
              message: "Failed to render password input.",
              cause: Option.some(error),
            }),
          ),
        );
      }
    }),
});

export const PasswordInputLive: Layer.Layer<PasswordInput> = Layer.succeed(
  PasswordInput,
  makeLivePasswordInputService(),
);
