import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

import { SourceNotResolvable } from "../../errors.js";

export const checkAzureReposRepoExists = (
  organization: string,
  project: string,
  repo: string,
): Effect.Effect<void, SourceNotResolvable, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const url = `https://dev.azure.com/${organization}/${project}/_git/${repo}`;
    const request = HttpClientRequest.head(url);

    const response = yield* client.execute(request).pipe(
      Effect.mapError(
        (error) =>
          new SourceNotResolvable({
            category: "validation",
            detail: `Failed to check Azure Repos: ${error instanceof Error ? error.message : String(error)}`,
            cause: error,
          }),
      ),
    );

    if (response.status < 200 || response.status >= 300) {
      return yield* new SourceNotResolvable({
        category: "validation",
        detail: `Not found on Azure Repos`,
      });
    }
  });
