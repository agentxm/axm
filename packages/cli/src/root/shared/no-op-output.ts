import * as Effect from "effect/Effect";

import { Verbosity } from "@agentxm/client-core/unstable/cli-flags";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import type { SuggestedAction } from "@agentxm/client-core/unstable/cli-runtime";
import { emitNoOpResult } from "../../json-output.js";
import { suggestionsForCurrentWorkspace } from "./scoped-command.js";

export const emitNoOpOutcome = <TCommand extends string>(
  command: TCommand,
  args: {
    readonly planName: string;
    readonly planDescription?: string;
    readonly message: string;
    readonly suggestions?: ReadonlyArray<SuggestedAction>;
    readonly withoutSuggestions?: boolean;
    readonly reconciliationRequired?: boolean;
  },
) =>
  Effect.gen(function* () {
    const emitted = yield* emitNoOpResult(command, args);
    if (emitted) {
      return;
    }

    const renderer = yield* CliRenderer;
    const verbosity = yield* Verbosity;
    const suggestions =
      args.suggestions === undefined
        ? undefined
        : yield* suggestionsForCurrentWorkspace(args.suggestions);
    yield* renderer.success(
      args.message,
      verbosity.level === "quiet"
        ? undefined
        : {
            ...(suggestions === undefined ? {} : { suggestions }),
            ...(args.withoutSuggestions === undefined
              ? {}
              : { withoutSuggestions: args.withoutSuggestions }),
          },
    );
  });
