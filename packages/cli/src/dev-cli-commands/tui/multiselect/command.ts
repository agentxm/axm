import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliEnvironmentTest } from "@axm.sh/core/unstable/cli-flags";
import { Input, InputLive } from "@axm.sh/core/unstable/input";
import { Output, OutputLive } from "@axm.sh/core/unstable/output";

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
            OutputLive(),
            Layer.provide(InputLive, CliEnvironmentTest({ nonInteractive: false })),
          ),
        ),
      ),
    );
  },
};
