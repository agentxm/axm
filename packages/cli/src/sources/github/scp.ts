import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ParseError } from "../errors.js";
import type { GitHubSource } from "../types.js";

/** Matches: git@github.com:owner/repo.git */
const GITHUB_SSH_PATTERN = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/;

export const parseScp = (input: string) => {
  const match = input.match(GITHUB_SSH_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(new ParseError({ message: "Invalid GitHub SSH URL format", input }));
  }
  return Effect.succeed({
    source: "github",
    owner: match[1],
    repo: match[2],
    ref: Option.none(),
    subPath: Option.none(),
  } satisfies GitHubSource);
};
