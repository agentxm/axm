import * as Effect from "effect/Effect";

import { ParseError } from "../errors.js";

export const checkGitLabRepoExists = (
  owner: string,
  repo: string,
): Effect.Effect<void, ParseError> =>
  Effect.tryPromise({
    try: () => fetch(`https://gitlab.com/${owner}/${repo}`, { method: "HEAD" }),
    catch: (error) =>
      new ParseError({
        message: `Failed to check GitLab: ${error instanceof Error ? error.message : String(error)}`,
        input: `${owner}/${repo}`,
      }),
  }).pipe(
    Effect.flatMap((response) =>
      response.ok
        ? Effect.void
        : Effect.fail(
            new ParseError({ message: `Not found on GitLab`, input: `${owner}/${repo}` }),
          ),
    ),
  );
