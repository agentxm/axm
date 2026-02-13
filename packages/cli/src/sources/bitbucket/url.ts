import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { makeCliError } from "../../cli-error/index.js";
import type { BitbucketSourceInput } from "../types.js";

export const CANONICAL_HOSTNAME = "bitbucket.org";

/** Matches: /owner/repo[/src/ref/path] */
const BITBUCKET_PATH_PATTERN = /^\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/src\/([^/]+)(?:\/(.+))?)?$/;

export const parseUrl = (url: URL, hostname: string = CANONICAL_HOSTNAME) => {
  if (url.hostname !== hostname) {
    return Effect.fail(
      makeCliError({
        code: "SOURCE_PARSE_FAILED",
        what: "Invalid Bitbucket URL format",
        details: [url.href],
      }),
    );
  }
  const match = url.pathname.match(BITBUCKET_PATH_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(
      makeCliError({
        code: "SOURCE_PARSE_FAILED",
        what: "Invalid Bitbucket URL format",
        details: [url.href],
      }),
    );
  }
  return Effect.succeed({
    type: "bitbucket",
    owner: match[1],
    repo: match[2],
    ref: Option.fromNullable(match[3]),
    subPath: Option.fromNullable(match[4]),
  } satisfies BitbucketSourceInput);
};
