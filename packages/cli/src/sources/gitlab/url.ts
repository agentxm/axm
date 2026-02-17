import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { makeCliError } from "../../cli-error/index.js";
import type { GitLabSourceInputLegacy } from "../types.js";

export const CANONICAL_HOSTNAME = "gitlab.com";

/** Matches: /owner/repo[/-/tree/ref/path] */
const GITLAB_PATH_PATTERN = /^\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/-\/tree\/([^/]+)(?:\/(.+))?)?$/;

export const parseUrl = (url: URL, hostname: string = CANONICAL_HOSTNAME) => {
  if (url.hostname !== hostname) {
    return Effect.fail(
      makeCliError({
        code: "SOURCE_PARSE_FAILED",
        what: "Invalid GitLab URL format",
        details: [url.href],
      }),
    );
  }
  const match = url.pathname.match(GITLAB_PATH_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(
      makeCliError({
        code: "SOURCE_PARSE_FAILED",
        what: "Invalid GitLab URL format",
        details: [url.href],
      }),
    );
  }
  return Effect.succeed({
    type: "gitlab",
    owner: match[1],
    repo: match[2],
    ref: Option.fromNullable(match[3]),
    subPath: Option.fromNullable(match[4]),
  } satisfies GitLabSourceInputLegacy);
};
