import * as Effect from "effect/Effect";
import { Activity, ActivityLive } from "../../../activity/index.js";

export const spinnerCommand = {
  handler: () => {
    const program = Effect.gen(function* () {
      const activity = yield* Activity;
      yield* activity.withSpinner(
        "Loading something...",
        () => Effect.sleep("2 seconds"),
        "Done loading!",
      );
    });
    return Effect.runPromise(program.pipe(Effect.provide(ActivityLive)));
  },
};
