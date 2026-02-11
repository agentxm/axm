import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ParseError } from "../errors.js";
import type { BitbucketSourceInput } from "../types.js";

export const CANONICAL_HOSTNAME = "bitbucket.org";

/** Matches: https://bitbucket.org/owner/repo[/src/ref/path] */
const BITBUCKET_HTTPS_PATTERN =
  /^https?:\/\/bitbucket\.org\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/src\/([^/]+)(?:\/(.+))?)?$/;

export const parseUrl = (url: URL) => {
  const match = url.href.match(BITBUCKET_HTTPS_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(
      new ParseError({ message: "Invalid Bitbucket URL format", input: url.href }),
    );
  }
  return Effect.succeed({
    source: "bitbucket",
    owner: match[1],
    repo: match[2],
    ref: Option.fromNullable(match[3]),
    subPath: Option.fromNullable(match[4]),
  } satisfies BitbucketSourceInput);
};
