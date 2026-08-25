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
      recovery: {
        action: "none",
        targetCliVersion: CLI_VERSION,
        targetSkillVersion: SKILL_VERSION,
        nextAction: null,
        steps: [],
      },
    });
  });

  it("upgrades an older CLI before re-evaluating the unchanged official skill", () => {
    const result = evaluateAxmSkillCompatibility(
      compatibleInput({
        cliVersion: "1.1.9",
        skill: {
          manifestVersion: SKILL_VERSION,
          source: "workspace",
          metadata: {
            [AXM_SKILL_CLI_VERSION_METADATA_KEY]: SKILL_VERSION,
            [AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY]: ">=1.2.0 <1.3.0",
          },
        },
      }),
    );

    expect(result.recovery).toEqual({
      action: "upgrade-cli",
      targetCliVersion: SKILL_VERSION,
      targetSkillVersion: SKILL_VERSION,
      nextAction: "axm upgrade",
      steps: [
        { boundary: "executable", command: "axm upgrade", preview: false },
        { boundary: "verification", command: "axm lint", preview: false },
      ],
    });
  });

  it("previews Registry recovery when a Registry-installed skill is older", () => {
    const result = evaluateAxmSkillCompatibility(compatibleInput({ cliVersion: "1.3.0" }));

    expect(result.recovery).toEqual({
      action: "update-registry-skill",
      targetCliVersion: "1.3.0",
      targetSkillVersion: "1.3.0",
      nextAction: "axm skills update --name axm --preview",
      steps: [
        {
          boundary: "workspace",
          command: "axm skills update --name axm --preview",
          preview: true,
        },
        {
          boundary: "workspace",
          command: "axm skills update --name axm",
          preview: false,
        },
        { boundary: "verification", command: "axm lint", preview: false },
      ],
    });
  });

  it("previews bundled workspace recovery for an older bundled skill", () => {
    const input = compatibleInput({ cliVersion: "1.3.0" });
    const result = evaluateAxmSkillCompatibility({
      ...input,
      skill:
        input.skill === null ? null : { ...input.skill, source: "bundled:@agentxm/skills/axm" },
    });

    expect(result.recovery).toMatchObject({
      action: "install-bundled-skill",
      targetCliVersion: "1.3.0",
      targetSkillVersion: "1.3.0",
      nextAction: "axm skills install @agentxm/skills/axm --bundled --preview",
    });
  });

  it("preserves incompatible workspace-authored source", () => {
    const result = evaluateAxmSkillCompatibility(
      compatibleInput({
        cliVersion: "1.3.0",
        skill: {
          manifestVersion: SKILL_VERSION,
          source: "workspace",
          metadata: {
            [AXM_SKILL_CLI_VERSION_METADATA_KEY]: SKILL_VERSION,
            [AXM_SKILL_CLI_VERSION_RANGE_METADATA_KEY]: ">=1.2.0 <1.3.0",
          },
        },
      }),
    );

    expect(result.recovery).toEqual({
      action: "preserve-authored-skill",
      targetCliVersion: "1.3.0",
      targetSkillVersion: "1.3.0",
      nextAction: "axm help upgrade",
      steps: [{ boundary: "verification", command: "axm help upgrade", preview: false }],
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

  it("does not let AXM_NO_UPDATE_CHECK hide a local incompatibility", () => {
    const original = process.env["AXM_NO_UPDATE_CHECK"];
    process.env["AXM_NO_UPDATE_CHECK"] = "1";
    try {
      expect(evaluateAxmSkillCompatibility(compatibleInput({ cliVersion: "1.3.0" }))).toMatchObject(
        {
          status: "incompatible",
          reasonCode: "cli-version-incompatible",
          recovery: { action: "update-registry-skill" },
        },
      );
    } finally {
      if (original === undefined) {
        delete process.env["AXM_NO_UPDATE_CHECK"];
      } else {
        process.env["AXM_NO_UPDATE_CHECK"] = original;
      }
    }
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
