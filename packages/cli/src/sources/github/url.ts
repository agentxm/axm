import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ParseError } from "../errors.js";
import type { GitHubSourceInput } from "../types.js";

/** Matches: https://github.com/owner/repo[/tree/ref/path] */
const GITHUB_HTTPS_PATTERN =
  /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+))?)?$/;

export const parseUrl = (url: URL) => {
  const match = url.href.match(GITHUB_HTTPS_PATTERN);
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
