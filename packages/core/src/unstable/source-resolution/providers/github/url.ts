import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { makeAppError } from "../../../app-error/index.js";
import { GitHubSourceParamsSchema, type GitHubSourceParams } from "../../../sources/types.js";

export const CANONICAL_HOSTNAME = "github.com";

/** Matches: /owner/repo[/tree/ref/path] */
const GITHUB_PATH_PATTERN = /^\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+))?)?$/;
const decodeGitHubSourceParams = Schema.decodeUnknownResult(GitHubSourceParamsSchema);

export const parseUrl = (url: URL, hostname: string = CANONICAL_HOSTNAME) => {
  if (url.hostname !== hostname) {
    return Effect.fail(
      makeAppError({
        code: "validation",
        detail: "Invalid GitHub URL format",
      }),
    );
  }
  const match = url.pathname.match(GITHUB_PATH_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(
      makeAppError({
        code: "validation",
        detail: "Invalid GitHub URL format",
      }),
    );
  }
  const decoded = decodeGitHubSourceParams({
    type: "github",
    owner: match[1],
    repo: match[2],
    ...(match[3] === undefined ? {} : { ref: match[3] }),
    ...(match[4] === undefined ? {} : { subPath: match[4] }),
  });
  return Result.isSuccess(decoded)
    ? Effect.succeed(decoded.success satisfies GitHubSourceParams)
    : Effect.fail(
        makeAppError({
          code: "validation",
          detail: "Invalid GitHub URL format",
        }),
      );
};
