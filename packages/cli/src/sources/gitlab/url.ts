import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ParseError } from "../errors.js";
import type { GitLabSourceInput } from "../types.js";

export const CANONICAL_HOSTNAME = "gitlab.com";

/** Matches: /owner/repo[/-/tree/ref/path] */
const GITLAB_PATH_PATTERN = /^\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/-\/tree\/([^/]+)(?:\/(.+))?)?$/;

export const parseUrl = (url: URL, hostname: string = CANONICAL_HOSTNAME) => {
  if (url.hostname !== hostname) {
    return Effect.fail(new ParseError({ message: "Invalid GitLab URL format", input: url.href }));
  }
  const match = url.pathname.match(GITLAB_PATH_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(new ParseError({ message: "Invalid GitLab URL format", input: url.href }));
  }
  return Effect.succeed({
    source: "gitlab",
    owner: match[1],
    repo: match[2],
    ref: Option.fromNullable(match[3]),
    subPath: Option.fromNullable(match[4]),
  } satisfies GitLabSourceInput);
};
