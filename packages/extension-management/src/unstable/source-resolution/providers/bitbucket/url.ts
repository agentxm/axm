import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { makeAppError } from "../../../app-error/index.js";
import { BitbucketSourceParamsSchema, type BitbucketSourceParams } from "../../../sources/types.js";
import { refFromUrlHash } from "../../url-fragment.js";

export const CANONICAL_HOSTNAME = "bitbucket.org";

/** Matches: /owner/repo[/src/ref/path] */
const BITBUCKET_PATH_PATTERN = /^\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/src\/([^/]+)(?:\/(.+))?)?$/;
const decodeBitbucketSourceParams = Schema.decodeUnknownResult(BitbucketSourceParamsSchema);

export const parseUrl = (url: URL, hostname: string = CANONICAL_HOSTNAME) => {
  if (url.hostname !== hostname) {
    return Effect.fail(
      makeAppError({
        code: "validation",
        detail: "Invalid Bitbucket URL format",
      }),
    );
  }
  const match = url.pathname.match(BITBUCKET_PATH_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(
      makeAppError({
        code: "validation",
        detail: "Invalid Bitbucket URL format",
      }),
    );
  }
  const fragmentRef = Option.getOrUndefined(refFromUrlHash(url));
  const decoded = decodeBitbucketSourceParams({
    type: "bitbucket",
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
    ? Effect.succeed(decoded.success satisfies BitbucketSourceParams)
    : Effect.fail(
        makeAppError({
          code: "validation",
          detail: "Invalid Bitbucket URL format",
        }),
      );
};
