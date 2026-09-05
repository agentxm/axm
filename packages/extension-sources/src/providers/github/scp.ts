import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { SourceSyntaxInvalid } from "../../errors.js";
import {
  GitHubSourceParamsSchema,
  type GitHubSourceParams,
} from "@agentxm/extension-model/unstable/sources/types";
import { CANONICAL_HOSTNAME } from "./url.js";

/** Matches: git@{hostname}:owner/repo.git */
const SCP_PATTERN = /^git@([^:]+):([^/]+)\/([^/]+?)(?:\.git)?$/;
const decodeGitHubSourceParams = Schema.decodeUnknownResult(GitHubSourceParamsSchema);

export const parseScp = (input: string, hostname: string = CANONICAL_HOSTNAME) => {
  const match = input.match(SCP_PATTERN);
  if (!match || !match[1] || !match[2] || !match[3] || match[1] !== hostname) {
    return Effect.fail(
      new SourceSyntaxInvalid({
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
        new SourceSyntaxInvalid({
          detail: "Invalid GitHub SSH URL format",
        }),
      );
};
