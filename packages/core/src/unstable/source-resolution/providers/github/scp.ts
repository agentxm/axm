import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { makeAppError } from "../../../app-error/index.js";
import { GitHubSourceParamsSchema, type GitHubSourceParams } from "../../../sources/types.js";
import { CANONICAL_HOSTNAME } from "./url.js";

/** Matches: git@{hostname}:owner/repo.git */
const SCP_PATTERN = /^git@([^:]+):([^/]+)\/([^/]+?)(?:\.git)?$/;
const decodeGitHubSourceParams = Schema.decodeUnknownResult(GitHubSourceParamsSchema);

export const parseScp = (input: string, hostname: string = CANONICAL_HOSTNAME) => {
  const match = input.match(SCP_PATTERN);
  if (!match || !match[1] || !match[2] || !match[3] || match[1] !== hostname) {
    return Effect.fail(
      makeAppError({
        code: "validation",
        detail: "Invalid GitHub SSH URL format",
      }),
    );
  }
  const decoded = decodeGitHubSourceParams({
    type: "github",
    owner: match[2],
    repo: match[3],
  });
  return Result.isSuccess(decoded)
    ? Effect.succeed(decoded.success satisfies GitHubSourceParams)
    : Effect.fail(
        makeAppError({
          code: "validation",
          detail: "Invalid GitHub SSH URL format",
        }),
      );
};
