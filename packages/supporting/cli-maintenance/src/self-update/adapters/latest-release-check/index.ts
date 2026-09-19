import * as Effect from "effect/Effect";
import type * as HttpClient from "effect/unstable/http/HttpClient";

import { UpdateCheckUnavailable, type LatestReleaseCheck } from "../../application/index.js";
import { resolveGithubLatestVersion } from "../github-latest/index.js";

export const makeLatestReleaseCheck = (
  httpClient: HttpClient.HttpClient,
): typeof LatestReleaseCheck.Service => ({
  check: () =>
    resolveGithubLatestVersion(httpClient).pipe(
      Effect.mapError(
        (cause) =>
          new UpdateCheckUnavailable({
            operation:
              cause.reason === "invalid-location"
                ? "latest-release-decode"
                : "latest-release-query",
            cause,
          }),
      ),
    ),
});
