import React from "react";
import { render } from "ink";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { PromptCancelled, PromptError } from "../errors.js";
import { MultiselectPrompt } from "./component.js";
import type { MultiselectConfig } from "./types.js";

export interface MultiselectService {
  readonly prompt: <T>(
    config: MultiselectConfig<T>,
  ) => Effect.Effect<readonly T[], PromptError | PromptCancelled>;
}

export class Multiselect extends Context.Tag("@axm.sh/cli/tui/Multiselect")<
  Multiselect,
  MultiselectService
>() {}

const makeLiveMultiselectService = (): MultiselectService => ({
  prompt: <T,>(config: MultiselectConfig<T>) =>
    Effect.async<readonly T[], PromptError | PromptCancelled>((resume) => {
      try {
        const instance = render(
          <MultiselectPrompt
            config={config}
            onSubmit={(indices) => {
              instance.unmount();
              const items = indices.map((i) => config.items[i]!);
              resume(Effect.succeed(items));
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
              message: "Failed to render multiselect.",
              cause: Option.some(error),
            }),
          ),
        );
      }
    }),
});

export const MultiselectLive: Layer.Layer<Multiselect> = Layer.succeed(
  Multiselect,
  makeLiveMultiselectService(),
);
