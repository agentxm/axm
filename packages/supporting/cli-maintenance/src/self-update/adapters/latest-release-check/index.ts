import * as Effect from "effect/Effect";
import type * as HttpClient from "effect/http/HttpClient";

import { UpdateCheckUnavailable, type LatestReleaseCheck } from "../../application/index.js";
import { resolveLatestReleaseVersion } from "../distribution-latest/index.js";

export const makeLatestReleaseCheck = (
  httpClient: HttpClient.HttpClient,
): typeof LatestReleaseCheck.Service => ({
  check: () =>
    resolveLatestReleaseVersion(httpClient).pipe(
      Effect.mapError(
        (cause) =>
          new UpdateCheckUnavailable({
            operation:
              cause.reason === "invalid-version" ? "latest-release-decode" : "latest-release-query",
            cause,
          }),
      ),
    ),
});
