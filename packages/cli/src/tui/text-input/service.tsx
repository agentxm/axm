import React from "react";
import { render } from "ink";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { PromptCancelled } from "../errors.js";
import type { CliError } from "../../cli-error/index.js";
import { TextInputPrompt } from "./component.js";
import type { TextInputConfig } from "./types.js";

export interface TextInputService {
  readonly prompt: (config: TextInputConfig) => Effect.Effect<string, CliError | PromptCancelled>;
}

export class TextInput extends Context.Tag("@axm.sh/cli/tui/TextInput")<
  TextInput,
  TextInputService
>() {}

const makeLiveTextInputService = (): TextInputService => ({
  prompt: (config) =>
    Effect.async<string, CliError | PromptCancelled>((resume) => {
      const instance = render(
        <TextInputPrompt
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
    }),
});

export const TextInputLive: Layer.Layer<TextInput> = Layer.succeed(
  TextInput,
  makeLiveTextInputService(),
);
