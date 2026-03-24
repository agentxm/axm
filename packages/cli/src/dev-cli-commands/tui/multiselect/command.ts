import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliFlagsTest } from "../../../cli-flags/index.js";
import { Input, InputLive } from "../../../input/index.js";
import { Output, OutputLive } from "../../../output/index.js";

export const multiselectCommand = {
  handler: () => {
    const program = Effect.gen(function* () {
      const input = yield* Input;
      const output = yield* Output;
      const choices = yield* input.multiselect({
        message: "Pick your favorite fruits:",
        options: ["Apple", "Banana", "Cherry", "Date", "Elderberry"].map((item) => ({
          value: item,
          label: item,
        })),
        required: true,
      });
      yield* output.success(`You picked: ${choices.join(", ")}`);
    });
    return Effect.runPromise(
      program.pipe(
        Effect.provide(
          Layer.mergeAll(
            OutputLive("text"),
            Layer.provide(InputLive, CliFlagsTest({ nonInteractive: false })),
          ),
        ),
      ),
    );
  },
};
