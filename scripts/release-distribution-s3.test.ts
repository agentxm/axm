import { Readable } from "node:stream";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import { makeReleaseStorage } from "./release-distribution-s3.js";

const provider = ConfigProvider.fromEnvRecord({
  RELEASE_R2_ACCOUNT_ID: "a".repeat(32),
  RELEASE_R2_BUCKET: "release-fixture",
  RELEASE_R2_ACCESS_KEY_ID: "fixture-access",
  RELEASE_R2_SECRET_ACCESS_KEY: "fixture-secret",
});

// Exercise the installed S3 SDK's serialization/signing and response decoding
// through its supported HTTP transport seam; no provider credentials or network.
describe("R2 release transport", () => {
  it.effect("sends conditional writes, preserves opaque ETags, and reads object bytes", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const requests: {
          method: string;
          host: string;
          path: string;
          headers: Record<string, string>;
        }[] = [];
        const store = yield* makeReleaseStorage(provider, {
          handle: async (request: {
            readonly method: string;
            readonly hostname: string;
            readonly path: string;
            readonly headers: Record<string, string>;
          }) => {
            requests.push({
              method: request.method,
              host: request.hostname,
              path: request.path,
              headers: request.headers,
            });
            return {
              response: {
                statusCode: 200,
                headers: { etag: '"opaque-etag"' },
                body: Readable.from([Buffer.from("1.2.3\n")]),
              },
            };
          },
        });
        const object = yield* store.read("latest.txt");
        expect(object?.etag).toBe('"opaque-etag"');
        expect(new TextDecoder().decode(object?.bytes)).toBe("1.2.3\n");
        const metadata = { contentType: "text/plain", cacheControl: "no-store" };
        yield* store.put("latest.txt", new TextEncoder().encode("1.2.4\n"), {
          ...metadata,
          condition: { etag: '"opaque-etag"' },
        });
        yield* store.put("cli-v1.2.4/install.sh", new TextEncoder().encode("script"), {
          ...metadata,
          condition: { absent: true },
        });
        expect(requests.map(({ method }) => method)).toEqual(["GET", "PUT", "PUT"]);
        expect(requests.every(({ host }) => host.endsWith(".r2.cloudflarestorage.com"))).toBe(true);
        expect(requests[1]?.headers["if-match"]).toBe('"opaque-etag"');
        expect(requests[2]?.headers["if-none-match"]).toBe("*");
        expect(requests[1]?.headers["cache-control"]).toBe("no-store");
      }),
    ),
  );

  it.effect(
    "distinguishes missing keys from denied reads and does not retry conditional failures",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const replies = [
            { status: 404, code: "NoSuchKey" },
            { status: 403, code: "AccessDenied" },
            { status: 412, code: "PreconditionFailed" },
          ];
          let calls = 0;
          const store = yield* makeReleaseStorage(provider, {
            handle: async () => {
              const reply = replies[calls++];
              if (reply === undefined) throw new Error("Unexpected retry");
              return {
                response: {
                  statusCode: reply.status,
                  headers: { "content-type": "application/xml" },
                  body: Readable.from([
                    Buffer.from(
                      `<Error><Code>${reply.code}</Code><Message>fixture-secret</Message></Error>`,
                    ),
                  ]),
                },
              };
            },
          });
          expect(yield* store.read("missing")).toBeNull();
          const denied = yield* Effect.flip(store.read("denied"));
          expect(denied.detail).toContain("AccessDenied");
          expect(denied.detail).not.toContain("fixture-secret");
          const conflict = yield* Effect.flip(
            store.put("latest.txt", new Uint8Array([1]), {
              contentType: "text/plain",
              cacheControl: "no-store",
              condition: { absent: true },
            }),
          );
          expect(conflict.detail).toContain("PreconditionFailed");
          expect(calls).toBe(3);
        }),
      ),
  );
});
