// TODO: (#52) Uses raw fetch instead of @effect/platform HttpClient. Should be wrapped
// with HttpClient and unit-tested with mock HTTP layer. Out of scope for code review sweep.
import * as Effect from "effect/Effect";

import { makeAppError, type AppError } from "../../app-error/index.js";

export const checkAzureReposRepoExists = (
  organization: string,
  project: string,
  repo: string,
): Effect.Effect<void, AppError> =>
  Effect.tryPromise({
    try: () =>
      fetch(`https://dev.azure.com/${organization}/${project}/_git/${repo}`, { method: "HEAD" }),
    catch: (error) =>
      makeAppError({
        code: "SOURCE_PARSE_FAILED",
        what: `Failed to check Azure Repos: ${error instanceof Error ? error.message : String(error)}`,
        details: [`${organization}/${project}/${repo}`],
      }),
  }).pipe(
    Effect.flatMap((response) =>
      response.ok
        ? Effect.void
        : Effect.fail(
            makeAppError({
              code: "SOURCE_PARSE_FAILED",
              what: `Not found on Azure Repos`,
              details: [`${organization}/${project}/${repo}`],
            }),
          ),
    ),
  );
