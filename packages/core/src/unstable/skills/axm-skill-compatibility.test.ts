import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FastCheck from "effect/testing/FastCheck";

import {
  AXM_SKILL_CLI_VERSION_METADATA_KEY,
  AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY,
  AxmSkillCompatibilityPolicy,
  evaluateAxmSkillCompatibility,
  makeAxmSkillCompatibilityPolicyLayer,
  validateAxmSkillCliVersionRange,
  type AxmSkillCompatibilityInput,
} from "./axm-skill-compatibility.js";

const CLI_VERSION = "1.2.3";
const SKILL_VERSION = "1.2.0";

const compatibleInput = (
  overrides: Partial<AxmSkillCompatibilityInput> = {},
): AxmSkillCompatibilityInput => ({
  cliVersion: CLI_VERSION,
  skill: {
    manifestVersion: SKILL_VERSION,
    source: "@agentxm/skills/axm@1.2.0",
    metadata: {
      [AXM_SKILL_CLI_VERSION_METADATA_KEY]: SKILL_VERSION,
      [AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY]: ">=1.2.0 <1.3.0",
    },
  },
  ...overrides,
});

describe("validateAxmSkillCliVersionRange", () => {
  it.each([
    ["1.2.3", true],
    [">=1.2.0 <1.3.0", true],
    ["^1.2.0", true],
    ["~1.2.0", true],
    [">=1.2.0 <1.3.0 || >=2.0.0 <2.1.0", true],
    ["*", false],
    ["1.x", false],
    [">=1.2.0", false],
    ["<2.0.0", false],
    [">=1.0.0 <2.0.0 || >=3.0.0", false],
    ["not-a-range", false],
    ["", false],
  ] as const)("classifies %s as valid=%s", (range, valid) => {
    expect(validateAxmSkillCliVersionRange(range).valid).toBe(valid);
  });

  it.prop(
    "accepts every generated exact semantic version",
    {
      major: FastCheck.integer({ min: 0, max: 100 }),
      minor: FastCheck.integer({ min: 0, max: 100 }),
      patch: FastCheck.integer({ min: 0, max: 100 }),
    },
    ({ major, minor, patch }) => {
      const version = `${major}.${minor}.${patch}`;
      expect(validateAxmSkillCliVersionRange(version)).toEqual({ valid: true });
    },
    { fastCheck: { numRuns: 250, seed: 0x41584d } },
  );
});

describe("evaluateAxmSkillCompatibility", () => {
  it("returns the complete compatible machine contract", () => {
    expect(evaluateAxmSkillCompatibility(compatibleInput())).toEqual({
      status: "compatible",
      cliVersion: CLI_VERSION,
      skillVersion: SKILL_VERSION,
      source: "@agentxm/skills/axm@1.2.0",
      declaredCliVersion: SKILL_VERSION,
      declaredCliVersionRange: ">=1.2.0 <1.3.0",
      reasonCode: null,
      detail: null,
    });
  });

  it.each([
    {
      name: "unavailable CLI version wins over every skill problem",
      input: compatibleInput({ cliVersion: "unknown", skill: null }),
      reasonCode: "cli-version-unavailable",
    },
    {
      name: "missing skill",
      input: compatibleInput({ skill: null }),
      reasonCode: "axm-skill-missing",
    },
    {
      name: "invalid manifest version wins over missing metadata",
      input: compatibleInput({
        skill: { manifestVersion: "invalid", source: null, metadata: null },
      }),
      reasonCode: "axm-skill-manifest-invalid",
    },
    {
      name: "missing metadata map",
      input: compatibleInput({
        skill: { manifestVersion: SKILL_VERSION, source: null, metadata: null },
      }),
      reasonCode: "compatibility-metadata-missing",
    },
    {
      name: "missing exact release key wins over malformed range",
      input: compatibleInput({
        skill: {
          manifestVersion: SKILL_VERSION,
          source: null,
          metadata: { [AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY]: "not-a-range" },
        },
      }),
      reasonCode: "compatibility-metadata-missing",
    },
    {
      name: "legacy metadata is not compatibility metadata",
      input: compatibleInput({
        skill: {
          manifestVersion: SKILL_VERSION,
          source: null,
          metadata: { "agentxm.ai/cli-version": SKILL_VERSION },
        },
      }),
      reasonCode: "compatibility-metadata-missing",
    },
    {
      name: "malformed exact release",
      input: compatibleInput({
        skill: {
          manifestVersion: SKILL_VERSION,
          source: null,
          metadata: {
            [AXM_SKILL_CLI_VERSION_METADATA_KEY]: "invalid",
            [AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY]: SKILL_VERSION,
          },
        },
      }),
      reasonCode: "compatibility-metadata-malformed",
    },
    {
      name: "unbounded range is malformed",
      input: compatibleInput({
        skill: {
          manifestVersion: SKILL_VERSION,
          source: null,
          metadata: {
            [AXM_SKILL_CLI_VERSION_METADATA_KEY]: SKILL_VERSION,
            [AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY]: ">=1.0.0",
          },
        },
      }),
      reasonCode: "compatibility-metadata-malformed",
    },
    {
      name: "manifest and release stamp disagree",
      input: compatibleInput({
        skill: {
          manifestVersion: SKILL_VERSION,
          source: null,
          metadata: {
            [AXM_SKILL_CLI_VERSION_METADATA_KEY]: "1.2.1",
            [AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY]: ">=1.2.0 <1.3.0",
          },
        },
      }),
      reasonCode: "skill-release-mismatch",
    },
    {
      name: "range excludes its own release",
      input: compatibleInput({
        skill: {
          manifestVersion: SKILL_VERSION,
          source: null,
          metadata: {
            [AXM_SKILL_CLI_VERSION_METADATA_KEY]: SKILL_VERSION,
            [AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY]: ">=1.1.0 <1.2.0",
          },
        },
      }),
      reasonCode: "skill-release-range-mismatch",
    },
    {
      name: "running CLI is outside the declared range",
      input: compatibleInput({ cliVersion: "1.3.0" }),
      reasonCode: "cli-version-incompatible",
    },
  ] as const)("reports $name", ({ input, reasonCode }) => {
    const result = evaluateAxmSkillCompatibility(input);

    expect(result.status).toBe("incompatible");
    expect(result.reasonCode).toBe(reasonCode);
    expect(result.detail).not.toBeNull();
  });

  it("is deterministic and does not mutate frozen input", () => {
    const input = Object.freeze(compatibleInput());

    const first = evaluateAxmSkillCompatibility(input);
    const second = evaluateAxmSkillCompatibility(input);

    expect(second).toEqual(first);
    expect(input).toEqual(compatibleInput());
  });

  it.effect("injects the CLI version and ignores non-AXM skills", () =>
    Effect.gen(function* () {
      const policy = yield* AxmSkillCompatibilityPolicy;
      const candidate = compatibleInput().skill;

      expect(policy.evaluate({ fqn: "@example/skills/other", candidate })).toBeNull();
      expect(policy.evaluate({ fqn: "@agentxm/skills/axm", candidate })).toMatchObject({
        status: "compatible",
        cliVersion: CLI_VERSION,
      });
    }).pipe(Effect.provide(makeAxmSkillCompatibilityPolicyLayer(CLI_VERSION))),
  );
});
