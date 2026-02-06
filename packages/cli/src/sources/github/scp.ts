import * as Effect from "effect/Effect";

import { ParseError } from "../errors.js";
import { make } from "./make.js";
import { GITHUB_SSH_PATTERN } from "./patterns.js";

export const parseScp = (input: string) => {
  const match = input.match(GITHUB_SSH_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return Effect.fail(new ParseError({ message: "Invalid GitHub SSH URL format", input }));
  }
  return Effect.succeed(make({ owner: match[1], repo: match[2] }));
};
