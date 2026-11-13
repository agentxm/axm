import { defineSpecification } from "@agentxm/specification-metadata";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  decodeResolutionRequestBody,
  ExactContentRequestSchema,
  ExactContentResponseSchema,
  exactContentResponseMatchesRequest,
} from "./resolutions.js";

export const specification = defineSpecification({
  requirement: "registry/exact-content-preserves-authority",
  title: "Exact content admission binds each allowance to the submitted content",
  statement:
    "AXM shall accept an exact-content admission response only when every submitted caller key has exactly one outcome and every allowance echoes the submitted extension identity, publisher binding, version, and integrity, without treating selection evidence or a validity interval as content authorization.",
  class: "constraint",
  role: "interface",
  goals: ["trustworthy-distribution"],
  methods: ["contract", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const item = (key: string) => ({
  key,
  identity: { owner: "@acme", type: "skill", name: "review" },
  expectedPublisherBinding: "hbnd_example",
  accepted: { version: "1.2.3", integrity: "sha512-accepted" },
});
const envelope = (items: ReadonlyArray<unknown>) => ({
  schemaVersion: 2,
  purpose: "authorize-exact",
  items,
});
const observedAt = "2026-11-13T12:00:00Z";
const allowed = (key: string) => ({
  key,
  outcome: "allowed",
  identity: item(key).identity,
  publisherBindingId: "hbnd_example",
  accepted: item(key).accepted,
  yanked: true,
  observedAt,
});
const response = (results: ReadonlyArray<unknown>) =>
  Schema.decodeUnknownSync(ExactContentResponseSchema)(
    {
      schemaVersion: 2,
      purpose: "authorize-exact",
      observedAt,
      results,
    },
    { onExcessProperty: "error" },
  );
const request = Schema.decodeUnknownSync(ExactContentRequestSchema)(
  envelope([item("first"), item("second")]),
);
const decode = (value: unknown) =>
  decodeResolutionRequestBody(new TextEncoder().encode(JSON.stringify(value)));

describe("exact content authorization evidence", () => {
  it.effect("accepts reordered independent outcomes and exact yanked content", () =>
    Effect.sync(() => {
      expect(
        exactContentResponseMatchesRequest(
          request,
          response([{ key: "second", outcome: "unavailable" }, allowed("first")]),
        ),
      ).toBe(true);
    }),
  );

  it.effect("rejects missing, extra, duplicate, and unsolicited keys", () =>
    Effect.sync(() => {
      for (const results of [
        [allowed("first")],
        [allowed("first"), allowed("second"), allowed("third")],
        [allowed("first"), allowed("first")],
        [allowed("first"), allowed("third")],
      ])
        expect(exactContentResponseMatchesRequest(request, response(results))).toBe(false);
    }),
  );

  it.effect("rejects allowances for different identities, publishers, versions, or bytes", () =>
    Effect.sync(() => {
      const original = allowed("first");
      for (const changed of [
        { ...original, identity: { ...original.identity, owner: "@other" } },
        { ...original, identity: { ...original.identity, type: "hook" } },
        { ...original, identity: { ...original.identity, name: "other" } },
        { ...original, publisherBindingId: "hbnd_other" },
        { ...original, accepted: { ...original.accepted, version: "1.2.4" } },
        { ...original, accepted: { ...original.accepted, integrity: "sha512-other" } },
      ])
        expect(
          exactContentResponseMatchesRequest(request, response([changed, allowed("second")])),
        ).toBe(false);
    }),
  );

  it.effect("rejects legacy, mixed-purpose, conditional, and unbounded requests", () =>
    Effect.sync(() => {
      expect(Result.isSuccess(decode(envelope([item("first")])))).toBe(true);
      for (const invalid of [
        { ...envelope([item("first")]), schemaVersion: 1 },
        envelope([{ ...item("first"), purpose: "restore-exact" }]),
        envelope([{ ...item("first"), knownRevision: "old" }]),
        envelope([{ ...item("first"), continuation: { token: "next", revision: "old" } }]),
        envelope([{ ...item("first"), expectedPublisherBinding: undefined }]),
        envelope([item("first"), item("first")]),
        envelope([]),
        envelope(Array.from({ length: 101 }, (_, i) => item(String(i)))),
        envelope([{ ...item("first"), key: "nul\u0000key" }]),
        envelope([{ ...item("first"), key: "surrogate\uD800" }]),
      ])
        expect(Result.isFailure(decode(invalid))).toBe(true);
    }),
  );

  it.effect("keeps denials distinct and refuses selection pages or authorization leases", () =>
    Effect.sync(() => {
      for (const outcome of [
        { outcome: "unavailable" },
        { outcome: "temporarily-unavailable" },
        { outcome: "lifecycle-blocked", reason: "held" },
        { outcome: "binding-conflict", publisherBindingId: "hbnd_other" },
        { outcome: "exact-conflict", reason: "integrity-mismatch" },
      ])
        expect(response([{ key: "first", ...outcome }]).results).toHaveLength(1);
      expect(() => response([{ ...allowed("first"), validUntil: observedAt }])).toThrow();
      expect(() => response([{ key: "first", outcome: "metadata", page: {} }])).toThrow();
    }),
  );
});
