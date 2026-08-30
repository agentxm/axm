import * as Effect from "effect/Effect";

import { Verbosity } from "@agentxm/extension-management/unstable/cli-flags";
import { CliRenderer } from "@agentxm/extension-management/unstable/cli-renderer";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

export const emitScaffoldSuccess = (args: {
  readonly message: string;
  readonly summary?: string;
  readonly suggestions: ReadonlyArray<SuggestedAction>;
  readonly withoutSuggestions: boolean;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
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
