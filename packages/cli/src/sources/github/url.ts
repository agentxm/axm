import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ParseError } from "../errors.js";
import type { GitHubSource } from "../types.js";
import { GITHUB_HTTPS_PATTERN } from "./patterns.js";

export const parseUrl = (url: URL) => {
  const match = url.href.match(GITHUB_HTTPS_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(new ParseError({ message: "Invalid GitHub URL format", input: url.href }));
  }
  return Effect.succeed({
    source: "github",
    owner: match[1],
    repo: match[2],
    ref: Option.fromNullable(match[3]),
    subPath: Option.fromNullable(match[4]),
  } satisfies GitHubSource);
};
