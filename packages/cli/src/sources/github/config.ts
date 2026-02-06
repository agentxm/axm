import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ParseError } from "../errors.js";
import { parseProviderShorthand } from "../parse-provider-shorthand.js";
import {
  type GitHubSource,
  type ParsedSource,
  ParsedSource as PS,
  type SourceConfig,
} from "../types.js";
import { GITHUB_HTTPS_PATTERN, GITHUB_SSH_PATTERN } from "./patterns.js";

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
  parseFromUrl: Option.some({
    hostname: "github.com",
    parseUrl: (_url, original) => {
      const match = original.match(GITHUB_HTTPS_PATTERN);
      if (!match || !match[1] || !match[2]) {
        return Effect.fail(
          new ParseError({ message: "Invalid GitHub URL format", input: original }),
        );
      }
      return Effect.succeed(
        PS.GitHub({ original, owner: match[1], repo: match[2], ref: match[3], subPath: match[4] }),
      );
    },
    parseScp: (input) => {
      const match = input.match(GITHUB_SSH_PATTERN);
      if (!match || !match[1] || !match[2]) {
        return Effect.fail(new ParseError({ message: "Invalid GitHub SSH URL format", input }));
      }
      return Effect.succeed(PS.GitHub({ original: input, owner: match[1], repo: match[2] }));
    },
  }),
};
