import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as HttpClient from "effect/http/HttpClient";

import { normalizeExactVersion } from "../../domain/index.js";

export const RELEASE_ORIGIN = "https://releases.axm.sh";
export const LATEST_RELEASE_URL = `${RELEASE_ORIGIN}/latest.txt`;

const REQUEST_TIMEOUT = "10 seconds";

export class LatestReleaseError extends Schema.TaggedError<LatestReleaseError>()(
  "LatestReleaseError",
  {
    reason: Schema.Literals([
      "transport",
      "timeout",
      "rate-limit",
      "not-found",
      "unavailable",
      "unexpected-status",
      "invalid-version",
    ]),
    status: Schema.optional(Schema.Number),
    retryAfter: Schema.optional(Schema.String),
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export const parseLatestReleaseVersion = (content: string): string | null =>
  normalizeExactVersion(content.trim());

/** Resolve the production distribution's stable version before fetching immutable assets. */
export const resolveLatestReleaseVersion = (httpClient: HttpClient.HttpClient) =>
  Effect.gen(function* () {
    const response = yield* httpClient
      .get(LATEST_RELEASE_URL, {
        headers: {
          Accept: "text/plain",
          "Cache-Control": "no-cache",
          "User-Agent": "axm-cli",
        },
      })
      .pipe(Effect.mapError((cause) => new LatestReleaseError({ reason: "transport", cause })));

    const retryAfter = response.headers["retry-after"] ?? response.headers["Retry-After"];
    if (response.status === 403 || response.status === 429) {
      return yield* new LatestReleaseError({
        reason: "rate-limit",
        status: response.status,
        ...(retryAfter === undefined ? {} : { retryAfter }),
      });
    }
    if (response.status === 404) {
      return yield* new LatestReleaseError({ reason: "not-found", status: response.status });
    }
    if (response.status >= 500) {
      return yield* new LatestReleaseError({
        reason: "unavailable",
        status: response.status,
      });
    }
    if (response.status !== 200) {
      return yield* new LatestReleaseError({
        reason: "unexpected-status",
        status: response.status,
      });
    }

    const content = yield* response.text.pipe(
      Effect.mapError((cause) => new LatestReleaseError({ reason: "transport", cause })),
    );
    const version = parseLatestReleaseVersion(content);
    if (version === null) {
      return yield* new LatestReleaseError({ reason: "invalid-version" });
    }
    return version;
  }).pipe(
    Effect.timeoutOrElse({
      duration: REQUEST_TIMEOUT,
      orElse: () => Effect.fail(new LatestReleaseError({ reason: "timeout" })),
    }),
  );
