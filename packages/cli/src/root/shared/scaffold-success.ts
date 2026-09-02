import * as Effect from "effect/Effect";

import { Verbosity } from "../../cli-flags/index.js";
import { Screen, makeScreenOutput } from "../../screen/index.js";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

export const emitScaffoldSuccess = (args: {
  readonly message: string;
  readonly summary?: string;
  readonly suggestions: ReadonlyArray<SuggestedAction>;
  readonly withoutSuggestions: boolean;
}) =>
  Effect.gen(function* () {
    const screen = yield* Screen;
    const renderer = makeScreenOutput(screen);
    const verbosity = yield* Verbosity;

    yield* renderer.success(
      args.message,
      verbosity.level === "quiet"
        ? undefined
        : {
            ...(args.summary === undefined ? {} : { summary: args.summary }),
            suggestions: args.suggestions,
            withoutSuggestions: args.withoutSuggestions,
          },
    );
  });
