import { readFileSync } from "node:fs";

import { defineSpecification } from "@agentxm/specification-metadata";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { resolveVersionEntry } from "@agentxm/extension-model/unstable/version-constraints/version-selection";
import { VersionSchema } from "@agentxm/extension-model/unstable/version-constraints";
import { ExtensionIndexSchema } from "./schema.js";

import {
  MAX_RESOLUTION_METADATA_ITEMS,
  MAX_RESOLUTION_METADATA_REQUEST_BYTES,
  ResolutionMetadataRequestSchema,
  ResolutionMetadataResponseSchema,
  decodeResolutionMetadataRequestBody,
  resolutionMetadataResponseMatchesRequest,
} from "./resolution-metadata.js";

export const specification = defineSpecification({
  requirement: "registry/resolution-metadata-preserves-batch-evidence",
  title: "Resolution metadata keeps batch evidence complete and attributable",
  statement:
    "A Registry batch metadata exchange shall use one unique caller key per bounded request item and one ordered outcome per key, shall distinguish complete metadata from a page requiring continuation, and shall reject a continued page whose revision differs from the request so AXM cannot select from incomplete or mixed evidence.",
  class: "constraint",
  role: "interface",
  goals: ["trustworthy-distribution", "dependable-change-process"],
  methods: ["contract", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const decodeRequest = Schema.decodeUnknownSync(ResolutionMetadataRequestSchema);
const decodeResponse = Schema.decodeUnknownSync(ResolutionMetadataResponseSchema);

const SelectorVectorsSchema = Schema.Struct({
  format: Schema.Literal("agentxm-resolution-metadata-vectors-v1"),
  selectionPolicyVersion: Schema.Literal("1"),
  evaluatedAt: Schema.String,
  cases: Schema.Array(
    Schema.Struct({
      name: Schema.NonEmptyString,
      source: Schema.Literals(["direct", "pack-member"] as const),
      index: ExtensionIndexSchema,
      request: Schema.Struct({
        purpose: Schema.Literals(["select", "restore-exact"] as const),
        range: Schema.String,
        minimumReleaseAgeSeconds: Schema.Number,
        acceptedIntegrity: Schema.optional(Schema.NonEmptyString),
        expectedPublisherBinding: Schema.optional(Schema.NonEmptyString),
        compatiblePackage: Schema.optional(
          Schema.Struct({ purl: Schema.NonEmptyString, version: VersionSchema }),
        ),
      }),
      expected: Schema.Struct({
        kind: Schema.Literals(["selected", "binding-conflict"] as const),
        version: Schema.optional(VersionSchema),
        warning: Schema.optional(Schema.Literal("yanked")),
        newerHeld: Schema.optional(VersionSchema),
      }),
    }),
  ),
});

const selectorVectors = Schema.decodeUnknownSync(SelectorVectorsSchema)(
  JSON.parse(
    readFileSync(new URL("../../../resolution-metadata.vectors.json", import.meta.url), "utf8"),
  ),
);

const selectItem = (key: string) => ({
  key,
  identity: { owner: "@acme", type: "skill", name: "review" },
  purpose: "select",
});

const request = (items: ReadonlyArray<unknown>) => ({
  schemaVersion: 1,
  selectionPolicyVersion: "1",
  items,
});

const evidence = {
  publisherBindingId: "hbnd_example",
  visibility: "public",
  archival: null,
  deprecation: null,
  revision: "revision-one",
  observedAt: "2026-09-22T12:00:00Z",
  validUntil: "2026-09-22T12:01:00Z",
};

const metadata = (key: string, continuation: string | null = null) => ({
  key,
  outcome: "metadata",
  page: {
    ...evidence,
    versions: [
      {
        version: "1.2.3",
        published: "2026-09-20T12:00:00Z",
        integrity: "sha512-accepted",
        dependencies: { "@acme/skills/core": "^1.0.0" },
        packages: [{ purl: "pkg:npm/%40acme/core" }],
        yankedAt: "2026-09-21T12:00:00Z",
        yankedCategory: "superseded",
      },
    ],
    continuation,
  },
});

const response = (results: ReadonlyArray<unknown>) => ({
  schemaVersion: 1,
  selectionPolicyVersion: "1",
  observedAt: "2026-09-22T12:00:00Z",
  results,
});

describe("resolution metadata batch evidence", () => {
  it.effect("publishes selector vectors for direct, pack, lifecycle and compatibility cases", () =>
    Effect.sync(() => {
      const manifest: unknown = JSON.parse(
        readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
      );
      expect(manifest).toHaveProperty(
        ["exports", "./unstable/registry/resolution-metadata.vectors.json"],
        "./resolution-metadata.vectors.json",
      );
      expect(manifest).toHaveProperty(
        "files",
        expect.arrayContaining(["resolution-metadata.vectors.json"]),
      );
      expect(selectorVectors.cases).toHaveLength(7);
      expect(new Set(selectorVectors.cases.map((entry) => entry.name)).size).toBe(7);
      expect(selectorVectors.cases.some((entry) => entry.source === "pack-member")).toBe(true);
      expect(
        selectorVectors.cases.some((entry) => entry.request.compatiblePackage !== undefined),
      ).toBe(true);
      expect(selectorVectors.cases.some((entry) => entry.expected.newerHeld !== undefined)).toBe(
        true,
      );

      for (const entry of selectorVectors.cases) {
        if (entry.expected.kind === "binding-conflict") {
          expect(entry.request.expectedPublisherBinding).not.toBe(entry.index.publisherBindingId);
          continue;
        }
        if (entry.expected.newerHeld !== undefined) continue;
        const selected = resolveVersionEntry(
          entry.index.versions,
          Option.some(entry.request.range),
        );
        expect(Option.getOrUndefined(selected)?.version).toBe(entry.expected.version);
        if (entry.expected.warning === "yanked") {
          expect(Option.getOrUndefined(selected)?.yankedAt).toBeDefined();
        }
      }
    }),
  );

  it.effect("classifies bounded request envelopes before item work", () =>
    Effect.sync(() => {
      const encoder = new TextEncoder();
      const valid = decodeResolutionMetadataRequestBody(
        encoder.encode(JSON.stringify(request([selectItem("review")]))),
      );
      expect(Result.isSuccess(valid)).toBe(true);

      const oversized = decodeResolutionMetadataRequestBody(
        new Uint8Array(MAX_RESOLUTION_METADATA_REQUEST_BYTES + 1),
      );
      expect(Result.isFailure(oversized) && oversized.failure.code).toBe("request-too-large");

      const unsupported = decodeResolutionMetadataRequestBody(
        encoder.encode(
          JSON.stringify({ ...request([selectItem("review")]), selectionPolicyVersion: "2" }),
        ),
      );
      expect(Result.isFailure(unsupported) && unsupported.failure.code).toBe(
        "unsupported-selection-policy-version",
      );

      const invalid = decodeResolutionMetadataRequestBody(
        encoder.encode(JSON.stringify(request([selectItem("same"), selectItem("same")]))),
      );
      expect(Result.isFailure(invalid) && invalid.failure.code).toBe("invalid-request");
    }),
  );

  it.effect("accepts a complete page with version selection evidence", () =>
    Effect.sync(() => {
      const decoded = decodeResponse(response([metadata("review")]));
      const first = decoded.results[0];
      expect(first?.outcome).toBe("metadata");
      if (first?.outcome !== "metadata") throw new Error("Expected metadata outcome");
      expect(first.page.continuation).toBeNull();
      expect(first.page.versions[0]?.dependencies).toEqual({
        "@acme/skills/core": "^1.0.0",
      });
      expect(first.page.versions[0]?.packages?.[0]?.purl).toBe("pkg:npm/%40acme/core");
      expect(first.page.versions[0]?.yankedAt).toBeDefined();
    }),
  );

  it.effect("rejects duplicate keys, excessive items and unsupported policy versions", () =>
    Effect.sync(() => {
      expect(() => decodeRequest(request([selectItem("same"), selectItem("same")]))).toThrow();
      expect(() =>
        decodeRequest(
          request(
            Array.from({ length: MAX_RESOLUTION_METADATA_ITEMS + 1 }, (_, i) =>
              selectItem(`key-${i}`),
            ),
          ),
        ),
      ).toThrow();
      expect(() =>
        decodeRequest({ ...request([selectItem("one")]), selectionPolicyVersion: "future" }),
      ).toThrow();
      expect(() => decodeRequest({ ...request([selectItem("one")]), schemaVersion: 2 })).toThrow();
    }),
  );

  it.effect("requires an accepted exact identity for exact restoration", () =>
    Effect.sync(() => {
      expect(() =>
        decodeRequest(request([{ ...selectItem("review"), purpose: "restore-exact" }])),
      ).toThrow();
      expect(
        decodeRequest(
          request([
            {
              ...selectItem("review"),
              purpose: "restore-exact",
              accepted: { version: "1.2.3", integrity: "sha512-accepted" },
              expectedPublisherBinding: "hbnd_example",
            },
          ]),
        ).items[0]?.purpose,
      ).toBe("restore-exact");
    }),
  );

  it.effect("checks every result's caller key in request order", () =>
    Effect.sync(() => {
      const submitted = decodeRequest(request([selectItem("first"), selectItem("second")]));
      const matching = decodeResponse(
        response([metadata("first"), { key: "second", outcome: "unavailable" }]),
      );
      const reversed = decodeResponse(
        response([{ key: "second", outcome: "unavailable" }, metadata("first")]),
      );
      expect(resolutionMetadataResponseMatchesRequest(submitted, matching)).toBe(true);
      expect(resolutionMetadataResponseMatchesRequest(submitted, reversed)).toBe(false);
    }),
  );

  it.effect("keeps continuation on one revision and requires restart when it changes", () =>
    Effect.sync(() => {
      const submitted = decodeRequest(
        request([
          {
            ...selectItem("review"),
            continuation: { token: "next-page", revision: "revision-one" },
          },
        ]),
      );
      expect(submitted.items[0]?.continuation).toEqual({
        token: "next-page",
        revision: "revision-one",
      });
      const next = decodeResponse(response([metadata("review", "third-page")]));
      expect(resolutionMetadataResponseMatchesRequest(submitted, next)).toBe(true);
      const changed = decodeResponse(
        response([
          {
            ...metadata("review", "third-page"),
            page: {
              ...metadata("review").page,
              revision: "revision-two",
              continuation: "third-page",
            },
          },
        ]),
      );
      expect(resolutionMetadataResponseMatchesRequest(submitted, changed)).toBe(false);
      const restart = decodeResponse(
        response([{ key: "review", outcome: "restart-required", revision: "revision-two" }]),
      );
      expect(resolutionMetadataResponseMatchesRequest(submitted, restart)).toBe(true);
      expect(
        resolutionMetadataResponseMatchesRequest(
          decodeRequest(request([selectItem("review")])),
          restart,
        ),
      ).toBe(false);
    }),
  );

  it.effect(
    "decodes each independent outcome without confusing absence with an envelope failure",
    () =>
      Effect.sync(() => {
        for (const outcome of [
          { key: "review", outcome: "unavailable" },
          { key: "review", outcome: "binding-conflict", publisherBindingId: "hbnd_changed" },
          { key: "review", outcome: "exact-conflict", reason: "integrity-mismatch" },
          { key: "review", outcome: "unchanged", ...evidence },
        ]) {
          expect(decodeResponse(response([outcome])).results).toHaveLength(1);
        }
        expect(() =>
          decodeResponse(response([{ key: "review", outcome: "storage-failed" }])),
        ).toThrow();
      }),
  );
});
