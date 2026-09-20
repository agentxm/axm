import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as HttpClient from "effect/unstable/http/HttpClient";

import { normalizeExactVersion } from "../../domain/index.js";

export const GITHUB_REPOSITORY = "agentxm/axm";
export const GITHUB_LATEST_RELEASE_URL = `https://github.com/${GITHUB_REPOSITORY}/releases/latest`;

const REQUEST_TIMEOUT = "10 seconds";
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

export class GithubLatestReleaseError extends Schema.TaggedError<GithubLatestReleaseError>()(
  "GithubLatestReleaseError",
  {
    reason: Schema.Literals([
      "transport",
      "timeout",
      "rate-limit",
      "not-found",
      "unavailable",
      "unexpected-status",
      "invalid-location",
    ]),
    status: Schema.optional(Schema.Number),
    retryAfter: Schema.optional(Schema.String),
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export const versionFromLatestReleaseLocation = (location: string): string | null => {
  if (!URL.canParse(location, GITHUB_LATEST_RELEASE_URL)) return null;
  const resolved = new URL(location, GITHUB_LATEST_RELEASE_URL);
  if (resolved.origin !== "https://github.com" || resolved.search !== "" || resolved.hash !== "") {
    return null;
  }
  const prefix = `/${GITHUB_REPOSITORY}/releases/tag/cli-v`;
  if (!resolved.pathname.startsWith(prefix)) return null;
  const version = resolved.pathname.slice(prefix.length);
  return normalizeExactVersion(version);
};

/** Resolve GitHub's latest stable release without using the rate-limited REST API. */
export const resolveGithubLatestVersion = (httpClient: HttpClient.HttpClient) =>
  Effect.gen(function* () {
    const response = yield* httpClient
      .get(GITHUB_LATEST_RELEASE_URL, {
        headers: {
          Accept: "text/html",
          "User-Agent": "axm-cli",
        },
      })
      .pipe(
        Effect.mapError((cause) => new GithubLatestReleaseError({ reason: "transport", cause })),
        Effect.timeoutOrElse({
          duration: REQUEST_TIMEOUT,
          orElse: () => Effect.fail(new GithubLatestReleaseError({ reason: "timeout" })),
        }),
      );

    const retryAfter = response.headers["retry-after"] ?? response.headers["Retry-After"];
    if (response.status === 403 || response.status === 429) {
      return yield* new GithubLatestReleaseError({
        reason: "rate-limit",
        status: response.status,
        ...(retryAfter === undefined ? {} : { retryAfter }),
      });
    }
    if (response.status === 404) {
      return yield* new GithubLatestReleaseError({ reason: "not-found", status: response.status });
    }
    if (response.status >= 500) {
      return yield* new GithubLatestReleaseError({
        reason: "unavailable",
        status: response.status,
      });
    }
    if (!redirectStatuses.has(response.status)) {
      return yield* new GithubLatestReleaseError({
        reason: "unexpected-status",
        status: response.status,
      });
    }

    const location = response.headers["location"] ?? response.headers["Location"];
    const version = location === undefined ? null : versionFromLatestReleaseLocation(location);
    if (version === null) {
      return yield* new GithubLatestReleaseError({ reason: "invalid-location" });
    }
    return version;
  });
