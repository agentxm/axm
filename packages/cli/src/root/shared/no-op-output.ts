import * as Effect from "effect/Effect";

import { Verbosity } from "@agentxm/client-core/unstable/cli-flags";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import type { SuggestedAction } from "@agentxm/client-core/unstable/cli-runtime";
import { emitNoOpResult } from "../../json-output.js";

export const emitNoOpOutcome = <TCommand extends string>(
  command: TCommand,
  args: {
    readonly planName: string;
    readonly planDescription?: string;
    readonly message: string;
    readonly suggestions?: ReadonlyArray<SuggestedAction>;
    readonly withoutSuggestions?: boolean;
  },
) =>
  Effect.gen(function* () {
    const emitted = yield* emitNoOpResult(command, args);
    if (emitted) {
      return;
    }

    const renderer = yield* CliRenderer;
    const verbosity = yield* Verbosity;
    yield* renderer.success(
      args.message,
      verbosity.level === "quiet"
        ? undefined
        : {
            ...(args.suggestions === undefined ? {} : { suggestions: args.suggestions }),
            ...(args.withoutSuggestions === undefined
              ? {}
              : { withoutSuggestions: args.withoutSuggestions }),
          },
    );
  });
