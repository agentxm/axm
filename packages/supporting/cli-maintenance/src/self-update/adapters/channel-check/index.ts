import {
  STABLE_CHANNEL_URL,
  decodeStableChannelDocument,
} from "@agentxm/extension-model/unstable/release-channel";
import * as Effect from "effect/Effect";
import type * as HttpClient from "effect/unstable/http/HttpClient";
import { UpdateCheckUnavailable, type StableChannelCheck } from "../../application/index.js";

export const makeStableChannelCheck = (
  httpClient: HttpClient.HttpClient,
): typeof StableChannelCheck.Service => ({
  check: (etag) =>
    Effect.gen(function* () {
      const response = yield* httpClient
        .get(STABLE_CHANNEL_URL, {
          headers: {
            Accept: "application/json",
            "User-Agent": "axm-cli",
            ...(etag === null ? {} : { "If-None-Match": etag }),
          },
        })
        .pipe(
          Effect.mapError(
            (cause) => new UpdateCheckUnavailable({ operation: "channel-query", cause }),
          ),
        );
      if (response.status === 304 && etag !== null) return { _tag: "NotModified" };
      if (response.status !== 200) {
        return yield* new UpdateCheckUnavailable({ operation: "channel-query" });
      }
      const document = yield* response.json.pipe(
        Effect.flatMap(decodeStableChannelDocument),
        Effect.mapError(
          (cause) => new UpdateCheckUnavailable({ operation: "channel-decode", cause }),
        ),
      );
      return {
        _tag: "Modified",
        document,
        etag: response.headers["etag"] ?? response.headers["ETag"] ?? null,
      };
    }),
});
