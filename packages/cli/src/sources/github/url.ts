import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ParseError } from "../errors.js";
import type { GitHubSourceInput } from "../types.js";

export const CANONICAL_HOSTNAME = "github.com";

/** Matches: /owner/repo[/tree/ref/path] */
const GITHUB_PATH_PATTERN = /^\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+))?)?$/;

export const parseUrl = (url: URL, hostname: string = CANONICAL_HOSTNAME) => {
  if (url.hostname !== hostname) {
    return Effect.fail(new ParseError({ message: "Invalid GitHub URL format", input: url.href }));
  }
  const match = url.pathname.match(GITHUB_PATH_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(new ParseError({ message: "Invalid GitHub URL format", input: url.href }));
  }
  return Effect.succeed({
    source: "github",
    owner: match[1],
    repo: match[2],
    ref: Option.fromNullable(match[3]),
    subPath: Option.fromNullable(match[4]),
  } satisfies GitHubSourceInput);
};
