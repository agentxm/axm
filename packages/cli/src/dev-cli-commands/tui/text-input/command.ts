import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliFlagsTest } from "@axm.sh/core/unstable/cli-flags";
import { Input, InputLive } from "@axm.sh/core/unstable/input";
import { Output, OutputLive } from "@axm.sh/core/unstable/output";

export const textInputCommand = {
  handler: () => {
    const program = Effect.gen(function* () {
      const input = yield* Input;
      const output = yield* Output;
      const name = yield* input.text({
        message: "What is your name?",
        placeholder: "Enter your name...",
      });
      yield* output.success(`Hello, ${name}!`);
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
