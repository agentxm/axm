import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ParseError } from "../errors.js";
import { parseProviderShorthand } from "../parse-provider-shorthand.js";
import type { GitHubSource, SourceConfig } from "../types.js";
import { GITHUB_HTTPS_PATTERN, GITHUB_SSH_PATTERN } from "./patterns.js";

export const make = (args: {
  owner: string;
  repo: string;
  ref?: string | undefined;
  subPath?: string | undefined;
}): GitHubSource => ({
  source: "github",
  owner: args.owner,
  repo: args.repo,
  ref: Option.fromNullable(args.ref),
  subPath: Option.fromNullable(args.subPath),
});

export const printShorthand = (source: GitHubSource) => `github:${source.owner}/${source.repo}`;
export const shorthandPrefix = "github" as const;
export const parseShorthand = (input: string) =>
  Effect.gen(function* () {
    const body = input.slice("github:".length);
    const parts = yield* parseProviderShorthand(body, input);
    return config.make(parts);
  });

export const parseUrl = (url: URL) => {
  const match = url.href.match(GITHUB_HTTPS_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(new ParseError({ message: "Invalid GitHub URL format", input: url.href }));
  }
  return Effect.succeed(
    make({ owner: match[1], repo: match[2], ref: match[3], subPath: match[4] }),
  );
};

export const parseScp = (input: string) => {
  const match = input.match(GITHUB_SSH_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(new ParseError({ message: "Invalid GitHub SSH URL format", input }));
  }
  return Effect.succeed(config.make({ owner: match[1], repo: match[2] }));
};

export const config: SourceConfig<"github", GitHubSource> = {
  id: "github",
  make: make,
  print: printShorthand,
  shorthand: Option.some({
    prefix: shorthandPrefix,
    parse: parseShorthand,
  }),
  parseFromUrl: Option.some({
    hostname: "github.com",
    parseUrl: parseUrl,
    parseScp: parseScp,
  }),
};
