import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Option from "effect/Option";
import { extensionName, handle } from "../../test-helpers.js";
import { makeLiveRegistryIndexMemo } from "./index-memo.js";

const observedAt = "2026-09-22T00:00:00.000Z";
const page = {
  publisherBindingId: "hbnd_test",
  visibility: "public",
  archival: null,
  deprecation: null,
  revision: "a".repeat(64),
  observedAt,
  validUntil: "2026-09-22T00:00:30.000Z",
  versions: [{ version: "1.0.0", published: observedAt, integrity: "sha512-test" }],
  continuation: null,
};

describe("Registry planning metadata batches", () => {
  it.effect("combines distinct concurrent member reads for one registry source", () =>
    Effect.gen(function* () {
      const paths: string[] = [];
      const http = HttpClient.make((request) =>
        Effect.sync(() => {
          paths.push(new URL(request.url).pathname);
          return HttpClientResponse.fromWeb(
            request,
            new Response(
              JSON.stringify({
                schemaVersion: 1,
                selectionPolicyVersion: "1",
                observedAt,
                results: [
                  { key: "0", outcome: "metadata", page },
                  { key: "1", outcome: "metadata", page },
                ],
              }),
              { status: 200 },
            ),
          );
        }),
      );
      const results = yield* Effect.gen(function* () {
        const memo = yield* makeLiveRegistryIndexMemo();
        return yield* Effect.all(
          [
            memo.get("https://registry.example.test", "trusted", {
              owner: handle("@acme"),
              type: "skill",
              name: extensionName("first"),
            }),
            memo.get("https://registry.example.test", "trusted", {
              owner: handle("@acme"),
              type: "skill",
              name: extensionName("second"),
            }),
          ],
          { concurrency: "unbounded" },
        );
      }).pipe(
        Effect.provide(NodeServices.layer),
        Effect.provideService(HttpClient.HttpClient, http),
      );

      expect(paths).toEqual(["/v1/resolutions/metadata"]);
      expect(results.map((result) => Option.map(result, (index) => index.name))).toEqual([
        Option.some(extensionName("first")),
        Option.some(extensionName("second")),
      ]);
    }),
  );
});
