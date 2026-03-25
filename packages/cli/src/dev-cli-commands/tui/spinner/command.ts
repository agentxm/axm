import * as Effect from "effect/Effect";
import { Activity, ActivityLive } from "@axm.sh/core/unstable/activity";

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
