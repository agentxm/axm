import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ParseError } from "../errors.js";
import type { GitHubSource } from "../types.js";
import { make } from "./make.js";

export const resolveRepo = (args: {
  readonly owner: string;
  readonly repo: string;
  readonly subPath?: string | undefined;
}): Effect.Effect<Option.Option<GitHubSource>, ParseError> =>
  Effect.tryPromise({
    try: () => fetch(`https://github.com/${args.owner}/${args.repo}`, { method: "HEAD" }),
    catch: (error) =>
      new ParseError({
        message: `Failed to check GitHub: ${error instanceof Error ? error.message : String(error)}`,
        input: `${args.owner}/${args.repo}`,
      }),
  }).pipe(
    Effect.map((response) =>
      response.ok
        ? Option.some(make({ owner: args.owner, repo: args.repo, subPath: args.subPath }))
        : Option.none(),
    ),
  );
