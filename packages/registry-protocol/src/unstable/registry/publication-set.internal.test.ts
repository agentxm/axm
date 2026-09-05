import { describe, expect, it } from "vitest";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";

import {
  decodeExtensionNameSync,
  decodeHandleSync,
  formatFqn,
} from "@agentxm/extension-model/unstable/extensions";
import type { VisibilityEvaluation } from "../publish/index.js";
import {
  decodeVersionRangeSync,
  decodeVersionSync,
} from "@agentxm/extension-model/unstable/version-constraints";
import {
  archiveSha256Hex,
  evaluateProspectivePackDependencyState,
  evaluateProspectivePackDependencies,
  normalizePublicationSet,
  publicationDescriptorDigest,
  publicationSetDigest,
  validatePublicationDescriptors,
  validatePublicationSetResponse,
  type PublicationDescriptor,
} from "./publication-set.js";
import { DeprecationViewSchema } from "@agentxm/extension-model/unstable/extensions/deprecation";

const skill: PublicationDescriptor = {
  target: {
    owner: decodeHandleSync("@acme"),
    type: "skill",
    name: decodeExtensionNameSync("review"),
    version: decodeVersionSync("1.2.0"),
  },
  participation: "publish",
  archiveSha256Hex: archiveSha256Hex(new TextEncoder().encode("skill")),
  visibility: { intent: null, request: "public" },
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
  visibility: { intent: null, request: null },
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

const evaluation = (
  descriptor: PublicationDescriptor,
  value: "public" | "private",
): VisibilityEvaluation => ({
  target: formatFqn(descriptor.target),
  intent: descriptor.visibility.intent,
  request: descriptor.visibility.request,
  resolved: { value, disposition: "establish", source: "explicit" },
  actual: null,
  comparison: "not-established",
  findings: [],
});

describe("publication set contract", () => {
  it("decodes every canonical deprecation guidance shape", () => {
    const deprecatedAt = "2026-08-15T20:00:00.000Z";
    const decode = Schema.decodeUnknownSync(DeprecationViewSchema);
    const shapes = [
      { deprecatedAt, message: "Use the supported workflow." },
      {
        deprecatedAt,
        replacement: { status: "available", fqn: "@acme/skills/review-next" },
      },
      {
        deprecatedAt,
        message: "Use the maintained replacement.",
        replacement: { status: "available", fqn: "@acme/skills/review-next" },
      },
      {
        deprecatedAt,
        replacement: { status: "unavailable", fqn: "@acme/skills/review-next" },
      },
      { deprecatedAt, replacement: { status: "unavailable" } },
    ];

    for (const shape of shapes) expect(() => decode(shape)).not.toThrow();
    expect(() => decode({ deprecatedAt })).toThrow();
  });

  it("canonicalizes descriptor and dependency order into stable digests", () => {
    const forward = normalizePublicationSet([pack, skill]);
    const reverse = normalizePublicationSet([skill, pack]);

    expect(forward).toEqual(reverse);
    expect(publicationSetDigest(forward)).toBe(publicationSetDigest(reverse));
    expect(publicationDescriptorDigest(pack)).toBe(
      "f7ee37ff8488e6b4ef99514496ad85f40153fb6defee0e511f9d5342cb60f50d",
    );
    expect(publicationSetDigest(forward)).toBe(
      "a7d28ff4005c1596cd373060c13279a58469573e49685fe17b8d767b4c210c6c",
    );
  });

  it("rejects duplicate targets and inconsistent descriptor shapes", () => {
    expect(() => validatePublicationDescriptors([skill, skill])).toThrow("Duplicate");
    expect(() =>
      validatePublicationDescriptors([
        {
          target: skill.target,
          participation: "publish",
          visibility: { intent: null, request: "public" },
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
          visibility: evaluation(skill, "public"),
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
        packVisibility: "public",
        dependencies: [dependency],
        snapshots: [],
        candidates: [
          {
            descriptor: skill,
            kind: "resolved",
            visibility: evaluation(skill, "public"),
          },
        ],
      }),
    ).toEqual([]);

    expect(
      evaluateProspectivePackDependencies({
        packVisibility: "public",
        dependencies: [dependency],
        snapshots: [],
        candidates: [
          {
            descriptor: skill,
            kind: "resolved",
            visibility: evaluation(skill, "private"),
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
        packVisibility: "public",
        dependencies: [dependency],
        snapshots: [
          {
            dependency,
            exists: true,
            visibility: "public",
            lifecycleState: "active",
            deprecation: null,
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

  it("allows a private pack to resolve a readable private dependency", () => {
    const dependency = pack.pack?.dependencies[1];
    if (dependency === undefined) throw new Error("Expected the review dependency");

    expect(
      evaluateProspectivePackDependencyState({
        packVisibility: "private",
        dependencies: [dependency],
        snapshots: [
          {
            dependency,
            exists: true,
            visibility: "private",
            lifecycleState: "active",
            deprecation: null,
            versions: [{ version: "1.4.0", status: "available", yanked: false, purged: false }],
          },
        ],
        candidates: [],
      }),
    ).toMatchObject({
      findings: [],
      resolutions: [{ dependency, effectiveVersion: "1.4.0" }],
    });
  });

  it("carries structured lifecycle guidance for deprecated dependencies", () => {
    const dependency = pack.pack?.dependencies[1];
    if (dependency === undefined) throw new Error("Expected the review dependency");

    expect(
      evaluateProspectivePackDependencies({
        packVisibility: "public",
        dependencies: [dependency],
        snapshots: [
          {
            dependency,
            exists: true,
            visibility: "public",
            lifecycleState: "active",
            deprecation: {
              deprecatedAt: DateTime.makeUnsafe("2026-08-15T20:00:00.000Z"),
              message: "Use the maintained replacement.",
              replacement: {
                status: "available",
                fqn: "@acme/skills/review-next",
              },
            },
            versions: [{ version: "1.4.0", status: "available", yanked: false, purged: false }],
          },
        ],
        candidates: [],
      }),
    ).toMatchObject([
      {
        ruleId: "pack/dependency-deprecated",
        severity: "warning",
        reason: "deprecated",
        deprecation: {
          message: "Use the maintained replacement.",
          replacement: {
            status: "available",
            fqn: "@acme/skills/review-next",
          },
        },
      },
    ]);
  });
});
