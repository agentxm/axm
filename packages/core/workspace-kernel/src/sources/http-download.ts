import { createHash } from "node:crypto";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as Context from "effect/Context";
import { collectBufferedArchive } from "@agentxm/registry-client";
import {
  ArtifactDigestSchema,
  type ArtifactDigest,
} from "@agentxm/extension-model/unstable/sources/http-artifact";
import { SourceNetworkFailure, SourceNotResolvable } from "./errors.js";

/** Public artifact transport, supplied without credentials and with automatic redirects disabled. */
export class ArtifactHttpClient extends Context.Service<
  ArtifactHttpClient,
  HttpClient.HttpClient
>()("@agentxm/workspace-kernel/sources/ArtifactHttpClient") {}

const digest = Schema.decodeUnknownSync(ArtifactDigestSchema);
export const httpArtifactDigest = (bytes: Uint8Array): ArtifactDigest =>
  digest(`sha256:${createHash("sha256").update(bytes).digest("hex")}`);

/** HTTP distribution is public HTTPS content; Registry credentials never participate. */
export const validateArtifactUrl = (url: URL) =>
  url.protocol !== "https:" || url.username !== "" || url.password !== ""
    ? Effect.fail(
        new SourceNotResolvable({
          category: "validation",
          detail: "Artifact URLs must use HTTPS without embedded credentials",
        }),
      )
    : Effect.void;

export interface DownloadedHttpArtifact {
  readonly url: URL;
  readonly digest: ArtifactDigest;
  readonly bytes: Uint8Array;
  readonly contentType: string | undefined;
}

/** Follow bounded redirects without allowing a protocol downgrade; verify before consumption. */
export const downloadHttpArtifact = (
  initial: URL,
  options: { readonly digest?: ArtifactDigest; readonly maxBytes?: number } = {},
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* ArtifactHttpClient;
      let url = initial;
      for (let redirects = 0; redirects <= 10; redirects++) {
        yield* validateArtifactUrl(url);
        const response = yield* client
          .get(url)
          .pipe(
            Effect.mapError(
              (cause) =>
                new SourceNetworkFailure({ detail: "Could not download source artifact", cause }),
            ),
          );
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers["location"];
          if (location === undefined)
            return yield* new SourceNetworkFailure({
              detail: "Artifact redirect has no Location header",
            });
          url = yield* Effect.try({
            try: () => new URL(location, url),
            catch: (cause) =>
              new SourceNotResolvable({
                category: "validation",
                detail: "Invalid artifact redirect URL",
                cause,
              }),
          });
          continue;
        }
        if (response.status < 200 || response.status >= 300)
          return yield* new SourceNotResolvable({
            category: response.status === 404 ? "not_found" : "network",
            detail: `Artifact request returned HTTP ${response.status}`,
          });
        const length = Number(response.headers["content-length"]);
        const bytes = yield* collectBufferedArchive(
          response.stream,
          options.maxBytes,
          Number.isSafeInteger(length) && length >= 0 ? length : undefined,
        ).pipe(
          Effect.mapError(
            (cause) =>
              new SourceNetworkFailure({ detail: "Could not read bounded source artifact", cause }),
          ),
        );
        const actualDigest = httpArtifactDigest(bytes);
        if (options.digest !== undefined && actualDigest !== options.digest)
          return yield* new SourceNotResolvable({
            category: "validation",
            detail: "Downloaded artifact does not match its accepted SHA-256 digest",
          });
        return {
          url,
          bytes,
          digest: actualDigest,
          contentType: response.headers["content-type"],
        } satisfies DownloadedHttpArtifact;
      }
      return yield* new SourceNetworkFailure({
        detail: "Source artifact exceeded the redirect limit",
      });
    }),
  ).pipe(
    Effect.timeout("60 seconds"),
    Effect.catchTag("TimeoutError", (cause) =>
      Effect.fail(
        new SourceNetworkFailure({ detail: "Source artifact download timed out", cause }),
      ),
    ),
  );
