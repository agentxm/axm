import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { nonInteractiveFlag } from "@axm.sh/core/unstable/cli-flags";
import { Input, InputLive } from "@axm.sh/core/unstable/input";
import { Output, OutputLive } from "@axm.sh/core/unstable/output";

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
            OutputLive(),
            Layer.provide(InputLive, Layer.succeed(nonInteractiveFlag, Option.some(false))),
          ),
        ),
      ),
    );
  },
};
