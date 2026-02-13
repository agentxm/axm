import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { makeCliError } from "../../cli-error/index.js";
import type { GitHubSourceInput } from "../types.js";
import { CANONICAL_HOSTNAME } from "./url.js";

/** Matches: git@{hostname}:owner/repo.git */
const SCP_PATTERN = /^git@([^:]+):([^/]+)\/([^/]+?)(?:\.git)?$/;

export const parseScp = (input: string, hostname: string = CANONICAL_HOSTNAME) => {
  const match = input.match(SCP_PATTERN);
  if (!match || !match[1] || !match[2] || !match[3] || match[1] !== hostname) {
    return Effect.fail(
      makeCliError({
        code: "SOURCE_PARSE_FAILED",
        what: "Invalid GitHub SSH URL format",
        details: [input],
      }),
    );
  }
  return Effect.succeed({
    type: "github",
    owner: match[2],
    repo: match[3],
    ref: Option.none(),
    subPath: Option.none(),
  } satisfies GitHubSourceInput);
};
