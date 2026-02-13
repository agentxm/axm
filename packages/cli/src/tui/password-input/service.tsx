import React from "react";
import { render } from "ink";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { PromptCancelled } from "../errors.js";
import { type CliError, makeCliError } from "../../cli-error/index.js";
import { PasswordInputPrompt } from "./component.js";
import type { PasswordInputConfig } from "./types.js";

export interface PasswordInputService {
  readonly prompt: (
    config: PasswordInputConfig,
  ) => Effect.Effect<string, CliError | PromptCancelled>;
}

export class PasswordInput extends Context.Tag("@axm.sh/cli/tui/PasswordInput")<
  PasswordInput,
  PasswordInputService
>() {}

const makeLivePasswordInputService = (): PasswordInputService => ({
  prompt: (config) =>
    Effect.async<string, CliError | PromptCancelled>((resume) => {
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
            makeCliError({
              code: "PROMPT_RENDER_FAILED",
              what: "Failed to render prompt",
              howToFix: "Run with --yes to skip prompts, or ensure stdin is a terminal",
              cause: error,
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
