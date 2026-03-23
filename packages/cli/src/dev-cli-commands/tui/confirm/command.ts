import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ClackLive, ClackLog, ClackPrompt } from "../../../clack-effect/index.js";
import { CliFlagsTest } from "../../../cli-flags/index.js";

export const confirmCommand = {
  handler: () => {
    const program = Effect.gen(function* () {
      const prompt = yield* ClackPrompt;
      const log = yield* ClackLog;
      const result = yield* prompt.confirm({ message: "Do you want to continue?" });
      yield* log.success(`You chose: ${result ? "Yes" : "No"}`);
    });
    return Effect.runPromise(
      program.pipe(
        Effect.provide(Layer.provide(ClackLive, CliFlagsTest({ nonInteractive: false }))),
      ),
    );
  },
};
