import React from "react";
import { render } from "ink";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { PromptCancelled } from "../errors.js";
import type { CliError } from "../../cli-error/index.js";
import { ConfirmPrompt } from "./component.js";
import type { ConfirmConfig } from "./types.js";

export interface ConfirmService {
  readonly prompt: (config: ConfirmConfig) => Effect.Effect<boolean, CliError | PromptCancelled>;
}

export class Confirm extends Context.Tag("@axm.sh/cli/tui/Confirm")<Confirm, ConfirmService>() {}

const makeLiveConfirmService = (): ConfirmService => ({
  prompt: (config) =>
    Effect.async<boolean, CliError | PromptCancelled>((resume) => {
      const instance = render(
        <ConfirmPrompt
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

export const ConfirmLive: Layer.Layer<Confirm> = Layer.succeed(Confirm, makeLiveConfirmService());
