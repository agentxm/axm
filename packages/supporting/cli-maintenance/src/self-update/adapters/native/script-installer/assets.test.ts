import { createHash } from "node:crypto";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { makeScriptReleaseAssets } from "./assets.js";

describe("native release asset observations", () => {
  for (const declaredLength of [undefined, "5"]) {
    it.effect(
      `returns exact streamed bytes with content length ${declaredLength ?? "unknown"}`,
      () =>
        Effect.gen(function* () {
          const progress = yield* Ref.make<
            ReadonlyArray<{
              readonly binary: string;
              readonly received: number;
              readonly total: number | undefined;
            }>
          >([]);
          const bytes = new Uint8Array([1, 2, 3, 4, 5]);
          const manifest = "fixture checksum manifest\n";
          const source = {
            binaryAssetUrl: "https://release.example/axm-linux-x64",
            checksumAssetUrl: "https://release.example/SHA256SUMS",
          };
          const client = HttpClient.make((request) =>
            Effect.sync(() => {
              if (request.url === source.checksumAssetUrl) {
                return HttpClientResponse.fromWeb(request, new Response(manifest));
              }
              const body = new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(bytes.slice(0, 2));
                  controller.enqueue(bytes.slice(2));
                  controller.close();
                },
              });
              return HttpClientResponse.fromWeb(
                request,
                new Response(body, {
                  headers: declaredLength === undefined ? {} : { "content-length": declaredLength },
                }),
              );
            }),
          );
          const assets = makeScriptReleaseAssets(client, (binary, read) =>
            read((received, total) =>
              Ref.update(progress, (observations) => [
                ...observations,
                { binary, received, total },
              ]),
            ),
          );

          const result = yield* assets.read(source, "axm-linux-x64");
          expect(result.bytes).toEqual(bytes);
          expect(result.sha256Hex).toBe(createHash("sha256").update(bytes).digest("hex"));
          expect(result.checksumManifest).toBe(manifest);
          expect(yield* Ref.get(progress)).toEqual(
            [2, 5].map((received) => ({
              binary: "axm-linux-x64",
              received,
              total: declaredLength === undefined ? undefined : 5,
            })),
          );
        }),
    );
  }
});
