import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { makeCliError } from "../../cli-error/index.js";
import type { GitHubSourceParams } from "../types.js";

export const CANONICAL_HOSTNAME = "github.com";

/** Matches: /owner/repo[/tree/ref/path] */
const GITHUB_PATH_PATTERN = /^\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+))?)?$/;

export const parseUrl = (url: URL, hostname: string = CANONICAL_HOSTNAME) => {
  if (url.hostname !== hostname) {
    return Effect.fail(
      makeCliError({
        code: "SOURCE_PARSE_FAILED",
        what: "Invalid GitHub URL format",
        details: [url.href],
      }),
    );
  }
  const match = url.pathname.match(GITHUB_PATH_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(
      makeCliError({
        code: "SOURCE_PARSE_FAILED",
        what: "Invalid GitHub URL format",
        details: [url.href],
      }),
    );
  }
  return Effect.succeed({
    type: "github",
    owner: match[1],
    repo: match[2],
    ref: Option.fromUndefinedOr(match[3]),
    subPath: Option.fromUndefinedOr(match[4]),
  } satisfies GitHubSourceParams);
};
