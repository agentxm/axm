import * as Effect from "effect/Effect";

import { ParseError } from "../errors.js";
import { make } from "./make.js";
import { GITHUB_HTTPS_PATTERN } from "./patterns.js";

export const parseUrl = (url: URL) => {
  const match = url.href.match(GITHUB_HTTPS_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(new ParseError({ message: "Invalid GitHub URL format", input: url.href }));
  }
  return Effect.succeed(
    make({ owner: match[1], repo: match[2], ref: match[3], subPath: match[4] }),
  );
};
