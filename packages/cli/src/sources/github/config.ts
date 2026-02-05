import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { ParseError } from "../errors.js";
import { parseProviderShorthand } from "../parse-provider-shorthand.js";
import {
  type GitHubSource,
  type ParsedSource,
  ParsedSource as PS,
  type SourceConfig,
} from "../types.js";

export const config: SourceConfig<"github", GitHubSource> = {
  id: "github",
  shorthand: Option.some({
    prefix: "github",
    parse: (input: string): Effect.Effect<ParsedSource<GitHubSource>, ParseError> =>
      Effect.gen(function* () {
        const body = input.slice("github:".length);
        const parts = yield* parseProviderShorthand(body, input);
        return PS.GitHub({ original: input, ...parts });
      }),
    print: (source) => `github:${source.owner}/${source.repo}`,
  }),
};
