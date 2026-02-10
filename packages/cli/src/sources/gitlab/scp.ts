import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ParseError } from "../errors.js";
import type { GitLabSource } from "../types.js";

/** Matches: git@gitlab.com:owner/repo.git */
const GITLAB_SSH_PATTERN = /^git@gitlab\.com:([^/]+)\/([^/]+?)(?:\.git)?$/;

export const parseScp = (input: string) => {
  const match = input.match(GITLAB_SSH_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(new ParseError({ message: "Invalid GitLab SSH URL format", input }));
  }
  return Effect.succeed({
    source: "gitlab",
    owner: match[1],
    repo: match[2],
    ref: Option.none(),
    subPath: Option.none(),
  } satisfies GitLabSource);
};
