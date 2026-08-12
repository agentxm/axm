import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";

import { decodeExtensionNameSync, decodeHandleSync } from "../extensions/index.js";
import {
  decodeVersionRangeSync,
  decodeVersionSync,
} from "../version-constraints/version-constraints.js";
import {
  archiveSha256Hex,
  evaluateProspectivePackDependencyState,
  evaluateProspectivePackDependencies,
  normalizePublicationSet,
  publicationDescriptorDigest,
  publicationSetDigest,
  PreviewPublicationSetV1RequestSchema,
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
  it("retains the released v1 request shape while the active contract is v2", () => {
    expect(
      Schema.decodeUnknownSync(PreviewPublicationSetV1RequestSchema)({
        contract: "publication-set-v1",
        candidates: [skill],
      }).contract,
    ).toBe("publication-set-v1");
  });

  it("canonicalizes descriptor and dependency order into stable digests", () => {
    const forward = normalizePublicationSet([pack, skill]);
    const reverse = normalizePublicationSet([skill, pack]);

    expect(forward).toEqual(reverse);
    expect(publicationSetDigest(forward)).toBe(publicationSetDigest(reverse));
    expect(publicationDescriptorDigest(pack)).toBe(
      "9af4f1a9f082bcf1be12f64f1e5afe2e8407b635160a0bb04434eb2eebb54b5c",
    );
    expect(publicationSetDigest(forward)).toBe(
      "c248d688a825b5c971abceddb2afe7a1a3fbc65b5cb8c548fabb9f75effb80f0",
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
      contract: "publication-set-v2",
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

  it("returns the highest effective satisfying version from the admitted snapshot", () => {
    const dependency = pack.pack?.dependencies[1];
    if (dependency === undefined) throw new Error("Expected the review dependency");

    expect(
      evaluateProspectivePackDependencyState({
        dependencies: [dependency],
        snapshots: [
          {
            dependency,
            exists: true,
            visibility: "public",
            lifecycleState: "active",
            deprecated: false,
            versions: [
              { version: "1.2.0", status: "available", yanked: false, purged: false },
              { version: "1.4.0", status: "available", yanked: false, purged: false },
            ],
          },
        ],
        candidates: [],
      }),
    ).toMatchObject({
      findings: [],
      resolutions: [{ dependency, effectiveVersion: "1.4.0" }],
    });
  });
});
