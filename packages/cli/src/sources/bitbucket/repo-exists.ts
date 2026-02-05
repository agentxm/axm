import * as Effect from "effect/Effect";

import { ParseError } from "../errors.js";

export const checkBitbucketRepoExists = (
  owner: string,
  repo: string,
): Effect.Effect<void, ParseError> =>
  Effect.tryPromise({
    try: () => fetch(`https://bitbucket.org/${owner}/${repo}`, { method: "HEAD" }),
    catch: (error) =>
      new ParseError({
        message: `Failed to check Bitbucket: ${error instanceof Error ? error.message : String(error)}`,
        input: `${owner}/${repo}`,
      }),
  }).pipe(
    Effect.flatMap((response) =>
      response.ok
        ? Effect.void
        : Effect.fail(
            new ParseError({ message: `Not found on Bitbucket`, input: `${owner}/${repo}` }),
          ),
    ),
  );
