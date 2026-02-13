import * as Effect from "effect/Effect";

import { makeCliError, type CliError } from "../../cli-error/index.js";

export const checkAzureReposRepoExists = (
  organization: string,
  project: string,
  repo: string,
): Effect.Effect<void, CliError> =>
  Effect.tryPromise({
    try: () =>
      fetch(`https://dev.azure.com/${organization}/${project}/_git/${repo}`, { method: "HEAD" }),
    catch: (error) =>
      makeCliError({
        code: "SOURCE_PARSE_FAILED",
        what: `Failed to check Azure Repos: ${error instanceof Error ? error.message : String(error)}`,
        details: [`${organization}/${project}/${repo}`],
      }),
  }).pipe(
    Effect.flatMap((response) =>
      response.ok
        ? Effect.void
        : Effect.fail(
            makeCliError({
              code: "SOURCE_PARSE_FAILED",
              what: `Not found on Azure Repos`,
              details: [`${organization}/${project}/${repo}`],
            }),
          ),
    ),
  );
