import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliFlagsTest } from "@axm.sh/core/unstable/cli-flags";
import { Input, InputLive } from "@axm.sh/core/unstable/input";
import { Output, OutputLive } from "@axm.sh/core/unstable/output";

export const selectCommand = {
  handler: () => {
    const program = Effect.gen(function* () {
      const input = yield* Input;
      const output = yield* Output;
      const choice = yield* input.select({
        message: "Pick a color:",
        options: ["Red", "Green", "Blue"].map((item) => ({
          value: item,
          label: item,
        })),
      });
      yield* output.success(`You picked: ${choice}`);
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
