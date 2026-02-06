import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ParseError } from "../errors.js";
import { parseProviderShorthand } from "../parse-provider-shorthand.js";
import {
  type BitbucketSource,
  type ParsedSource,
  ParsedSource as PS,
  type SourceConfig,
} from "../types.js";
import { BITBUCKET_HTTPS_PATTERN, BITBUCKET_SSH_PATTERN } from "./patterns.js";

export const config: SourceConfig<"bitbucket", BitbucketSource> = {
  id: "bitbucket",
  shorthand: Option.some({
    prefix: "bitbucket",
    parse: (input: string): Effect.Effect<ParsedSource<BitbucketSource>, ParseError> =>
      Effect.gen(function* () {
        const body = input.slice("bitbucket:".length);
        const parts = yield* parseProviderShorthand(body, input);
        return PS.Bitbucket({ original: input, ...parts });
      }),
    print: (source) => `bitbucket:${source.owner}/${source.repo}`,
  }),
  parseFromUrl: Option.some({
    hostname: "bitbucket.org",
    parseUrl: (_url, original) => {
      const match = original.match(BITBUCKET_HTTPS_PATTERN);
      if (!match || !match[1] || !match[2]) {
        return Effect.fail(
          new ParseError({ message: "Invalid Bitbucket URL format", input: original }),
        );
      }
      return Effect.succeed(
        PS.Bitbucket({
          original,
          owner: match[1],
          repo: match[2],
          ref: match[3],
          subPath: match[4],
        }),
      );
    },
    parseScp: (input) => {
      const match = input.match(BITBUCKET_SSH_PATTERN);
      if (!match || !match[1] || !match[2]) {
        return Effect.fail(new ParseError({ message: "Invalid Bitbucket SSH URL format", input }));
      }
      return Effect.succeed(PS.Bitbucket({ original: input, owner: match[1], repo: match[2] }));
    },
  }),
};
