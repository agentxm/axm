import { readFileSync } from "node:fs";

import { defineSpecification } from "@agentxm/specification-metadata";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  PUBLICATION_SET_CONTRACT,
  PublicationDescriptorSchema,
  Sha256HexSchema,
  publicationDescriptorDigest,
  publicationSetDigest,
} from "./publication-set.js";

export const specification = defineSpecification({
  requirement: "registry/publication-set-digests-follow-versioned-vectors",
  title: "Publication-set digests follow versioned conformance vectors",
  statement:
    "Publication descriptor and set digests shall match the byte-vendorable vectors published by the Registry protocol package regardless of input object-key, candidate, or pack-dependency order; absent optional fields shall be omitted and null optional fields rejected before hashing; and a digest algorithm change shall use a new contract identifier and vector format.",
  class: "constraint",
  role: "interface",
  goals: ["trustworthy-distribution", "dependable-change-process"],
  methods: ["contract", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const PublicationDigestVectorsSchema = Schema.Struct({
  format: Schema.Literal("agentxm-publication-set-digest-vectors-v1"),
  contract: Schema.Literal(PUBLICATION_SET_CONTRACT),
  canonicalization: Schema.Struct({
    encoding: Schema.NonEmptyString,
    objectKeys: Schema.NonEmptyString,
    candidateOrder: Schema.NonEmptyString,
    dependencyOrder: Schema.NonEmptyString,
    optionalFields: Schema.NonEmptyString,
    evolution: Schema.NonEmptyString,
  }),
  vectors: Schema.Array(
    Schema.Struct({
      name: Schema.NonEmptyString,
      candidates: Schema.Array(
        Schema.Struct({
          descriptor: PublicationDescriptorSchema,
          descriptorDigest: Sha256HexSchema,
        }),
      ),
      publicationSetDigest: Sha256HexSchema,
    }),
  ),
});

const encodedVectors: unknown = JSON.parse(
  readFileSync(new URL("../../../publication-set.vectors.json", import.meta.url), "utf8"),
);
const digestVectors = Schema.decodeUnknownSync(PublicationDigestVectorsSchema)(encodedVectors);

const reverseObjectKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, nested]) => [key, reverseObjectKeys(nested)]),
  );
};

describe("Publication-set digest conformance", () => {
  it.effect("publishes the vectors at an explicit package subpath", () =>
    Effect.sync(() => {
      const manifest: unknown = JSON.parse(
        readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
      );
      expect(manifest).toHaveProperty(
        ["exports", "./unstable/registry/publication-set.vectors.json"],
        "./publication-set.vectors.json",
      );
      expect(manifest).toHaveProperty(
        "files",
        expect.arrayContaining(["publication-set.vectors.json"]),
      );
    }),
  );

  it.effect.each(digestVectors.vectors)("matches vendorable digest vector $name", (vector) =>
    Effect.sync(() => {
      const descriptors = vector.candidates.map((candidate) => candidate.descriptor);
      for (const candidate of vector.candidates) {
        expect(publicationDescriptorDigest(candidate.descriptor)).toBe(candidate.descriptorDigest);
        expect(publicationDescriptorDigest(reverseObjectKeys(candidate.descriptor))).toBe(
          candidate.descriptorDigest,
        );
      }
      expect(publicationSetDigest(descriptors)).toBe(vector.publicationSetDigest);
      expect(publicationSetDigest([...descriptors].reverse())).toBe(vector.publicationSetDigest);
    }),
  );

  it.effect("rejects null optional fields before hashing", () =>
    Effect.sync(() => {
      const descriptor = digestVectors.vectors[0]?.candidates[0]?.descriptor;
      if (descriptor === undefined) throw new Error("Expected an omission vector");

      expect(() =>
        publicationDescriptorDigest({ ...descriptor, archiveSha256Hex: null }),
      ).toThrow();
      expect(() => publicationSetDigest([{ ...descriptor, pack: null }])).toThrow();
    }),
  );
});
