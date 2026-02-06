import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ParseError } from "../errors.js";
import type { GitLabSource } from "../types.js";
import { GITLAB_HTTPS_PATTERN } from "./patterns.js";

export const parseUrl = (url: URL) => {
  const match = url.href.match(GITLAB_HTTPS_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(new ParseError({ message: "Invalid GitLab URL format", input: url.href }));
  }
  return Effect.succeed({
    source: "gitlab",
    owner: match[1],
    repo: match[2],
    ref: Option.fromNullable(match[3]),
    subPath: Option.fromNullable(match[4]),
  } satisfies GitLabSource);
};
