import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ParseError } from "../errors.js";
import type { BitbucketSourceInput } from "../types.js";

/** Matches: git@bitbucket.org:owner/repo.git */
const BITBUCKET_SSH_PATTERN = /^git@bitbucket\.org:([^/]+)\/([^/]+?)(?:\.git)?$/;

export const parseScp = (input: string) => {
  const match = input.match(BITBUCKET_SSH_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(new ParseError({ message: "Invalid Bitbucket SSH URL format", input }));
  }
  return Effect.succeed({
    source: "bitbucket",
    owner: match[1],
    repo: match[2],
    ref: Option.none(),
    subPath: Option.none(),
  } satisfies BitbucketSourceInput);
};
