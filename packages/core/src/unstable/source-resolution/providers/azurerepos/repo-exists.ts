import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

import { makeAppError, type AppError } from "../../../app-error/index.js";

export const checkAzureReposRepoExists = (
  organization: string,
  project: string,
  repo: string,
): Effect.Effect<void, AppError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const url = `https://dev.azure.com/${organization}/${project}/_git/${repo}`;
    const request = HttpClientRequest.head(url);

    const response = yield* client.execute(request).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "SOURCE_PARSE_FAILED",
          what: `Failed to check Azure Repos: ${error instanceof Error ? error.message : String(error)}`,
          details: [`${organization}/${project}/${repo}`],
          cause: error,
        }),
      ),
    );

    if (response.status < 200 || response.status >= 300) {
      return yield* Effect.fail(
        makeAppError({
          code: "SOURCE_PARSE_FAILED",
          what: `Not found on Azure Repos`,
          details: [`${organization}/${project}/${repo}`],
        }),
      );
    }
  });
