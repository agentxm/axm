import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ParseError } from "../errors.js";
import { parseProviderShorthand } from "../parse-provider-shorthand.js";
import type { GitLabSource, SourceConfig } from "../types.js";
import { GITLAB_HTTPS_PATTERN, GITLAB_SSH_PATTERN } from "./patterns.js";

export const config: SourceConfig<"gitlab", GitLabSource> = {
  id: "gitlab",
  make: (args: {
    owner: string;
    repo: string;
    ref?: string | undefined;
    subPath?: string | undefined;
  }): GitLabSource => ({
    source: "gitlab",
    owner: args.owner,
    repo: args.repo,
    ref: Option.fromNullable(args.ref),
    subPath: Option.fromNullable(args.subPath),
  }),
  print: (source) => `gitlab:${source.owner}/${source.repo}`,
  shorthand: Option.some({
    prefix: "gitlab",
    parse: (input: string): Effect.Effect<GitLabSource, ParseError> =>
      Effect.gen(function* () {
        const body = input.slice("gitlab:".length);
        const parts = yield* parseProviderShorthand(body, input);
        return config.make(parts);
      }),
  }),
  parseFromUrl: Option.some({
    hostname: "gitlab.com",
    parseUrl: (_url, original) => {
      const match = original.match(GITLAB_HTTPS_PATTERN);
      if (!match || !match[1] || !match[2]) {
        return Effect.fail(
          new ParseError({ message: "Invalid GitLab URL format", input: original }),
        );
      }
      return Effect.succeed(
        config.make({ owner: match[1], repo: match[2], ref: match[3], subPath: match[4] }),
      );
    },
    parseScp: (input) => {
      const match = input.match(GITLAB_SSH_PATTERN);
      if (!match || !match[1] || !match[2]) {
        return Effect.fail(new ParseError({ message: "Invalid GitLab SSH URL format", input }));
      }
      return Effect.succeed(config.make({ owner: match[1], repo: match[2] }));
    },
  }),
};
