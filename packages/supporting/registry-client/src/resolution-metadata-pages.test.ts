import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  ResolutionMetadataRequestSchema,
  ResolutionMetadataResponseSchema,
  type ResolutionMetadataResponse,
} from "@agentxm/registry-protocol/unstable/registry/resolution-metadata";
import { collectResolutionMetadataPages } from "./resolution-metadata-pages.js";

const decodeRequest = Schema.decodeUnknownSync(ResolutionMetadataRequestSchema);
const decodeResponse = Schema.decodeUnknownSync(ResolutionMetadataResponseSchema);
const observedAt = "2026-09-22T00:00:00.000Z";
const validUntil = "2026-09-22T00:00:30.000Z";
const current = {
  publisherBindingId: "binding",
  visibility: "public",
  archival: null,
  deprecation: null,
  revision: "revision",
  observedAt,
  validUntil,
};
const request = decodeRequest({
  schemaVersion: 2,
  purpose: "select",
  selectionPolicyVersion: "1",
  items: [
    {
      key: "first",
      identity: { owner: "@acme", type: "skill", name: "first" },
    },
    {
      key: "second",
      identity: { owner: "@acme", type: "skill", name: "second" },
    },
  ],
});
const version = (index: number) => ({
  version: `1.0.${index}`,
  published: observedAt,
  integrity: `sha512-${index}`,
});
const page = (
  key: string,
  versions: ReadonlyArray<ReturnType<typeof version>>,
  continuation: string | null,
) => ({
  key,
  outcome: "metadata",
  page: { ...current, versions, continuation },
});
const response = (results: ReadonlyArray<unknown>): ResolutionMetadataResponse =>
  decodeResponse({
    schemaVersion: 2,
    purpose: "select",
    selectionPolicyVersion: "1",
    observedAt,
    results,
  });

describe("complete batch metadata pages", () => {
  it.effect("collects a whole history before returning results in caller order", () =>
    Effect.gen(function* () {
      const submitted: string[][] = [];
      const replies = [
        response([
          { key: "second", outcome: "unavailable" },
          page(
            "first",
            Array.from({ length: 100 }, (_, index) => version(index)),
            "next",
          ),
        ]),
        response([page("first", [version(100)], null)]),
      ];
      const results = yield* collectResolutionMetadataPages(request, (input) => {
        submitted.push(input.items.map((item) => item.key));
        const next = replies.shift();
        return next === undefined ? Effect.die("Unexpected page") : Effect.succeed(next);
      });
      expect(submitted).toEqual([["first", "second"], ["first"]]);
      expect(results.map((result) => result.key)).toEqual(["first", "second"]);
      const first = results[0];
      expect(first?.outcome).toBe("metadata");
      if (first?.outcome === "metadata") {
        expect(first.page.versions).toHaveLength(101);
        expect(first.page.continuation).toBeNull();
      }
    }),
  );

  it.effect("refuses a changed or repeated continuation without exposing a partial history", () =>
    Effect.gen(function* () {
      const replies = [
        response([page("first", [version(0)], "next"), { key: "second", outcome: "unavailable" }]),
        response([page("first", [version(1)], "next")]),
      ];
      const result = yield* Effect.result(
        collectResolutionMetadataPages(request, () => {
          const next = replies.shift();
          return next === undefined ? Effect.die("Unexpected page") : Effect.succeed(next);
        }),
      );
      expect(result._tag).toBe("Failure");
    }),
  );
});
