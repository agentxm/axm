import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ParseError } from "../errors.js";
import { parseProviderShorthand } from "../parse-provider-shorthand.js";
import type { BitbucketSource, SourceConfig } from "../types.js";
import { BITBUCKET_HTTPS_PATTERN, BITBUCKET_SSH_PATTERN } from "./patterns.js";

export const config: SourceConfig<"bitbucket", BitbucketSource> = {
  id: "bitbucket",
  make: (args: {
    owner: string;
    repo: string;
    ref?: string | undefined;
    subPath?: string | undefined;
  }): BitbucketSource => ({
    source: "bitbucket",
    owner: args.owner,
    repo: args.repo,
    ref: Option.fromNullable(args.ref),
    subPath: Option.fromNullable(args.subPath),
  }),
  print: (source) => `bitbucket:${source.owner}/${source.repo}`,
  shorthand: Option.some({
    prefix: "bitbucket",
    parse: (input: string): Effect.Effect<BitbucketSource, ParseError> =>
      Effect.gen(function* () {
        const body = input.slice("bitbucket:".length);
        const parts = yield* parseProviderShorthand(body, input);
        return config.make(parts);
      }),
  }),
  parseFromUrl: Option.some({
    hostname: "bitbucket.org",
    parseUrl: (url) => {
      const match = url.href.match(BITBUCKET_HTTPS_PATTERN);
      if (!match || !match[1] || !match[2]) {
        return Effect.fail(
          new ParseError({ message: "Invalid Bitbucket URL format", input: url.href }),
        );
      }
      return Effect.succeed(
        config.make({ owner: match[1], repo: match[2], ref: match[3], subPath: match[4] }),
      );
    },
    parseScp: (input) => {
      const match = input.match(BITBUCKET_SSH_PATTERN);
      if (!match || !match[1] || !match[2]) {
        return Effect.fail(new ParseError({ message: "Invalid Bitbucket SSH URL format", input }));
      }
      return Effect.succeed(config.make({ owner: match[1], repo: match[2] }));
    },
  }),
};
