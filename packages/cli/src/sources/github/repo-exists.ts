import * as Effect from "effect/Effect";

import { ParseError } from "../errors.js";

export const checkGitHubRepoExists = (
  owner: string,
  repo: string,
): Effect.Effect<void, ParseError> =>
  Effect.tryPromise({
    try: () => fetch(`https://github.com/${owner}/${repo}`, { method: "HEAD" }),
    catch: (error) =>
      new ParseError({
        message: `Failed to check GitHub: ${error instanceof Error ? error.message : String(error)}`,
        input: `${owner}/${repo}`,
      }),
  }).pipe(
    Effect.flatMap((response) =>
      response.ok
        ? Effect.void
        : Effect.fail(
            new ParseError({ message: `Not found on GitHub`, input: `${owner}/${repo}` }),
          ),
    ),
  );
