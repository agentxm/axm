import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { makeAppError } from "../../../app-error/index.js";
import { GitLabSourceParamsSchema, type GitLabSourceParams } from "../../../sources/types.js";
import { refFromUrlHash } from "../../url-fragment.js";

export const CANONICAL_HOSTNAME = "gitlab.com";

/** Matches: /owner/repo[/-/tree/ref/path] */
const GITLAB_PATH_PATTERN = /^\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/-\/tree\/([^/]+)(?:\/(.+))?)?$/;
const decodeGitLabSourceParams = Schema.decodeUnknownResult(GitLabSourceParamsSchema);

export const parseUrl = (url: URL, hostname: string = CANONICAL_HOSTNAME) => {
  if (url.hostname !== hostname) {
    return Effect.fail(
      makeAppError({
        code: "validation",
        detail: "Invalid GitLab URL format",
      }),
    );
  }
  const match = url.pathname.match(GITLAB_PATH_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(
      makeAppError({
        code: "validation",
        detail: "Invalid GitLab URL format",
      }),
    );
  }
  const fragmentRef = Option.getOrUndefined(refFromUrlHash(url));
  const decoded = decodeGitLabSourceParams({
    type: "gitlab",
    owner: match[1],
    repo: match[2],
    ...(match[3] === undefined
      ? fragmentRef === undefined
        ? {}
        : { ref: fragmentRef }
      : { ref: match[3] }),
    ...(match[4] === undefined ? {} : { subPath: match[4] }),
  });
  return Result.isSuccess(decoded)
    ? Effect.succeed(decoded.success satisfies GitLabSourceParams)
    : Effect.fail(
        makeAppError({
          code: "validation",
          detail: "Invalid GitLab URL format",
        }),
      );
};
