import { describe, expect, it } from "vitest";

import { decodeExtensionNameSync, decodeHandleSync } from "../extensions/index.js";
import {
  decodeVersionRangeSync,
  decodeVersionSync,
} from "../version-constraints/version-constraints.js";
import {
  archiveSha256Hex,
  evaluateProspectivePackDependencies,
  normalizePublicationSet,
  publicationDescriptorDigest,
  publicationSetDigest,
  validatePublicationDescriptors,
  validatePublicationSetResponse,
  type PublicationDescriptor,
} from "./publication-set.js";

const skill: PublicationDescriptor = {
  target: {
    owner: decodeHandleSync("@acme"),
    type: "skill",
    name: decodeExtensionNameSync("review"),
    version: decodeVersionSync("1.2.0"),
  },
  participation: "publish",
  archiveSha256Hex: archiveSha256Hex(new TextEncoder().encode("skill")),
  initialVisibility: "public",
};

const pack: PublicationDescriptor = {
  target: {
    owner: decodeHandleSync("@acme"),
    type: "pack",
    name: decodeExtensionNameSync("team"),
    version: decodeVersionSync("2.0.0"),
  },
  participation: "publish",
  archiveSha256Hex: archiveSha256Hex(new TextEncoder().encode("pack")),
  pack: {
    dependencies: [
      {
        owner: decodeHandleSync("@zeta"),
        type: "skill",
        name: decodeExtensionNameSync("last"),
        range: decodeVersionRangeSync("^1.0.0"),
      },
      {
        owner: decodeHandleSync("@acme"),
        type: "skill",
        name: decodeExtensionNameSync("review"),
        range: decodeVersionRangeSync("^1.2.0"),
      },
    ],
  },
};

describe("publication set contract", () => {
  it("canonicalizes descriptor and dependency order into stable digests", () => {
    const forward = normalizePublicationSet([pack, skill]);
    const reverse = normalizePublicationSet([skill, pack]);

    expect(forward).toEqual(reverse);
    expect(publicationSetDigest(forward)).toBe(publicationSetDigest(reverse));
    expect(publicationDescriptorDigest(pack)).toBe(
      "59459ef901adb965524da0000b65252e6bf9d5158ce7086de3332524fafa89ea",
    );
    expect(publicationSetDigest(forward)).toBe(
      "f1bf8d08aecf9438872b11be284cf86a6e4559c06f992d85eba1799dcb074d21",
    );
  });

  it("rejects duplicate targets and inconsistent descriptor shapes", () => {
    expect(() => validatePublicationDescriptors([skill, skill])).toThrow("Duplicate");
    expect(() =>
      validatePublicationDescriptors([
        {
          target: skill.target,
          participation: "publish",
          initialVisibility: "public",
        },
      ]),
    ).toThrow("archiveSha256Hex");
    expect(() =>
      validatePublicationDescriptors([{ ...skill, pack: { dependencies: [] } }]),
    ).toThrow("Pack declarations");
  });

  it("accepts only complete digest-bound admitted responses", () => {
    const descriptors = validatePublicationDescriptors([skill]);
    const response = {
      contract: "publication-set-v1",
      publicationSetDigest: publicationSetDigest(descriptors),
      status: "admitted",
      candidates: [
        {
          kind: "resolved",
          target: skill.target,
          participation: "publish",
          descriptorDigest: publicationDescriptorDigest(skill),
          resolvedVisibility: "public",
          condition: '"pv2-vector"',
        },
      ],
      packs: [],
    } as const;

    expect(validatePublicationSetResponse(descriptors, response)).toEqual(response);
    expect(() =>
      validatePublicationSetResponse(descriptors, { ...response, candidates: [] }),
    ).toThrow("every candidate");
    expect(() =>
      validatePublicationSetResponse(descriptors, {
        ...response,
        status: "blocked",
      }),
    ).toThrow("conditions");
  });

  it("evaluates pack dependencies against the complete prospective set", () => {
    const dependency = pack.pack?.dependencies[1];
    if (dependency === undefined) throw new Error("Expected the review dependency");

    expect(
      evaluateProspectivePackDependencies({
        dependencies: [dependency],
        snapshots: [],
        candidates: [
          {
            descriptor: skill,
            kind: "resolved",
            resolvedVisibility: "public",
          },
        ],
      }),
    ).toEqual([]);

    expect(
      evaluateProspectivePackDependencies({
        dependencies: [dependency],
        snapshots: [],
        candidates: [
          {
            descriptor: skill,
            kind: "resolved",
            resolvedVisibility: "private",
          },
        ],
      }),
    ).toMatchObject([
      {
        ruleId: "pack/dependency-version-resolvable",
        severity: "error",
        reason: "selected-new-private",
        path: "./pack.json",
      },
    ]);
  });
});
