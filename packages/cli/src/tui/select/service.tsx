import { render } from "ink";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { PromptCancelled } from "../errors.js";
import { type CliError, makeCliError } from "../../cli-error/index.js";
import { SelectPrompt } from "./component.js";
import type { SelectConfig } from "./types.js";

export interface SelectService {
  readonly prompt: <T>(config: SelectConfig<T>) => Effect.Effect<T, CliError | PromptCancelled>;
}

export class Select extends Context.Tag("@axm.sh/cli/tui/Select")<Select, SelectService>() {}

const makeLiveSelectService = (): SelectService => ({
  prompt: <T,>(config: SelectConfig<T>) =>
    Effect.async<T, CliError | PromptCancelled>((resume) => {
      const instance = render(
        <SelectPrompt
          config={config}
          onSelect={(index) => {
            instance.unmount();
            const item = config.items[index];
            if (item === undefined) {
              resume(
                Effect.fail(
                  makeCliError({
                    code: "PROMPT_RENDER_FAILED",
                    what: `Invalid selection index: ${String(index)}`,
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
