import * as Effect from "effect/Effect";

import { ParseError } from "../errors.js";

export const checkAzureReposRepoExists = (
  organization: string,
  project: string,
  repo: string,
): Effect.Effect<void, ParseError> =>
  Effect.tryPromise({
    try: () =>
      fetch(`https://dev.azure.com/${organization}/${project}/_git/${repo}`, { method: "HEAD" }),
    catch: (error) =>
      new ParseError({
        message: `Failed to check Azure Repos: ${error instanceof Error ? error.message : String(error)}`,
        input: `${organization}/${project}/${repo}`,
      }),
  }).pipe(
    Effect.flatMap((response) =>
      response.ok
        ? Effect.void
        : Effect.fail(
            new ParseError({
              message: `Not found on Azure Repos`,
              input: `${organization}/${project}/${repo}`,
            }),
          ),
    ),
  );
