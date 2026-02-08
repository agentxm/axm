import { render } from "ink";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { PromptCancelled, PromptError } from "../errors.js";
import { SelectPrompt } from "./component.js";
import type { SelectConfig } from "./types.js";

export interface SelectService {
  readonly prompt: <T>(config: SelectConfig<T>) => Effect.Effect<T, PromptError | PromptCancelled>;
}

export class Select extends Context.Tag("@axm.sh/cli/tui/Select")<Select, SelectService>() {}

const makeLiveSelectService = (): SelectService => ({
  prompt: <T,>(config: SelectConfig<T>) =>
    Effect.async<T, PromptError | PromptCancelled>((resume) => {
      const instance = render(
        <SelectPrompt
          config={config}
          onSelect={(index) => {
            instance.unmount();
            const item = config.items[index];
            if (item === undefined) {
              resume(
                Effect.fail(
                  new PromptError({
                    message: `Invalid selection index: ${String(index)}`,
                    cause: Option.none(),
                  }),
                ),
              );
              return;
            }
            resume(Effect.succeed(item));
          }}
          onCancel={() => {
            instance.unmount();
            resume(Effect.fail(new PromptCancelled({ message: "Operation cancelled." })));
          }}
        />,
      );
    }),
});

export const SelectLive: Layer.Layer<Select> = Layer.succeed(Select, makeLiveSelectService());
