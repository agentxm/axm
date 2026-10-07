import { defineSpecification } from "@agentxm/specification-metadata";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import {
  decodeExtensionNameSync,
  decodeHandleSync,
  formatFqn,
} from "@agentxm/extension-model/unstable/extensions";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import {
  archiveSha256Hex,
  publicationDescriptorDigest,
  publicationSetDigest,
  validatePublicationDescriptors,
  validatePublicationSetResponse,
  type PublicationDescriptor,
  type PreviewPublicationSetResponse,
} from "./publication-set.js";

export const specification = defineSpecification({
  requirement: "registry/publication-sets-support-bounded-catalogs",
  title: "Publication sets support bounded catalogs of up to 200 candidates",
  statement:
    "AXM shall accept publication-set-v2 descriptor sets containing up to 200 distinct valid candidates and validate their complete digest-bound admission responses; it shall reject sets containing more than 200 candidates before accepting admission evidence.",
  class: "constraint",
  role: "interface",
  goals: ["trustworthy-distribution", "dependable-change-process"],
  methods: ["contract", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const catalog = (size: number): ReadonlyArray<PublicationDescriptor> =>
  Array.from({ length: size }, (_, index) => ({
    target: {
      owner: decodeHandleSync("@acme"),
      type: "skill",
      name: decodeExtensionNameSync(`catalog-${index}`),
      version: decodeVersionSync("1.0.0"),
    },
    participation: "publish",
    archiveSha256Hex: archiveSha256Hex(new TextEncoder().encode(`archive-${index}`)),
    visibility: { intent: null, request: "public" },
  }));

const admitted = (descriptors: ReadonlyArray<PublicationDescriptor>) =>
  ({
    contract: "publication-set-v2",
    publicationSetDigest: publicationSetDigest(descriptors),
    status: "admitted",
    candidates: descriptors.map((descriptor) => ({
      kind: "resolved",
      target: descriptor.target,
      participation: descriptor.participation,
      descriptorDigest: publicationDescriptorDigest(descriptor),
      visibility: {
        target: formatFqn(descriptor.target),
        intent: descriptor.visibility.intent,
        request: descriptor.visibility.request,
        resolved: { value: "public", disposition: "establish", source: "explicit" },
        actual: null,
        comparison: "not-established",
        findings: [],
      },
      condition: '"catalog-admission"',
    })),
    packs: [],
  }) satisfies PreviewPublicationSetResponse;

describe("bounded publication catalogs", () => {
  for (const size of [1, 100, 101, 152, 200]) {
    it.effect(`accepts ${size} candidates and their exact admission response`, () =>
      Effect.sync(() => {
        const descriptors = catalog(size);
        expect(validatePublicationDescriptors(descriptors)).toHaveLength(size);
        const response = admitted(descriptors);
        expect(validatePublicationSetResponse(descriptors, response)).toEqual(response);
      }),
    );
  }
  it.effect("rejects 201 candidates", () =>
    Effect.sync(() => {
      expect(() => validatePublicationDescriptors(catalog(201))).toThrow("at most 200 candidates");
    }),
  );
});
