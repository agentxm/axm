import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { ParseError } from "../errors.js";
import { parseProviderShorthand } from "../parse-provider-shorthand.js";
import {
  type BitbucketSource,
  type ParsedSource,
  ParsedSource as PS,
  type SourceConfig,
} from "../types.js";

export const config: SourceConfig<"bitbucket", BitbucketSource> = {
  id: "bitbucket",
  shorthandPrefix: Option.some("bitbucket"),
  parseShorthand: Option.some(
    (input: string): Effect.Effect<ParsedSource<BitbucketSource>, ParseError> =>
      Effect.gen(function* () {
        const body = input.slice("bitbucket:".length);
        const parts = yield* parseProviderShorthand(body, input);
        return PS.Bitbucket({ original: input, ...parts });
      }),
  ),
};
