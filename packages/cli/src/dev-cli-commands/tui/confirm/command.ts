import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { CliFlagsTest } from "../../../cli-flags/index.js";
import { Input, InputLive } from "../../../input/index.js";
import { Output, OutputLive } from "../../../output/index.js";

export const confirmCommand = {
  handler: () => {
    const program = Effect.gen(function* () {
      const input = yield* Input;
      const output = yield* Output;
      const result = yield* input.confirm({ message: "Do you want to continue?" });
      yield* output.success(`You chose: ${result ? "Yes" : "No"}`);
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
