/**
 * Unit tests for `SettingsSchema.lint` composition.
 *
 * Covers the spec scenarios for "Workspace settings expose lint.rules
 * configuration": valid maps decode, wildcard keys are rejected, unknown rule
 * ids surface at decode.
 */

import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";
import { SettingsSchema } from "@agentxm/workspace-state";
import { registerLintRuleIds } from "@agentxm/registry-protocol/unstable/lint/config";

// Register a sample rule id so tests can reference it. Tests in the same
// module share the allowlist state; Phases 3a/3b/3c will register catalogs.
const SAMPLE_RULE_ID = "skill/manifest-keys-recognized";
registerLintRuleIds([SAMPLE_RULE_ID]);

describe("SettingsSchema lint section", () => {
  it.each(["off", "info", "warn", "error"])(
    "accepts the '%s' severity for an exact registered rule id",
    (severity) => {
      const decoded = Schema.decodeUnknownSync(SettingsSchema)({
        lint: { rules: { [SAMPLE_RULE_ID]: severity } },
      });

      expect(decoded.lint?.rules?.[SAMPLE_RULE_ID]).toBe(severity);
    },
  );

  it("rejects the finding spelling 'warning' as a configured severity", () => {
    expect(() =>
      Schema.decodeUnknownSync(SettingsSchema)({
        lint: { rules: { [SAMPLE_RULE_ID]: "warning" } },
      }),
    ).toThrow();
  });

  it("accepts settings with a valid lint.rules map", () => {
    const decoded = Schema.decodeUnknownSync(SettingsSchema)({
      lint: { rules: { [SAMPLE_RULE_ID]: "error" } },
    });

    expect(decoded.lint?.rules?.[SAMPLE_RULE_ID]).toBe("error");
  });

  it("accepts settings with an absent lint section", () => {
    const decoded = Schema.decodeUnknownSync(SettingsSchema)({});

    expect(decoded.lint).toBeUndefined();
  });

  it("accepts settings with an empty lint object", () => {
    const decoded = Schema.decodeUnknownSync(SettingsSchema)({ lint: {} });

    expect(decoded.lint).toEqual({});
  });

  it("rejects wildcard keys in lint.rules", () => {
    expect(() =>
      Schema.decodeUnknownSync(SettingsSchema)({
        lint: { rules: { "skill/*": "warn" } },
      }),
    ).toThrow();
  });

  it("rejects unknown rule ids in lint.rules", () => {
    expect(() =>
      Schema.decodeUnknownSync(SettingsSchema)({
        lint: { rules: { "skill/does-not-exist": "warn" } },
      }),
    ).toThrow();
  });

  it("does not break existing settings consumers without a lint section", () => {
    const decoded = Schema.decodeUnknownSync(SettingsSchema)({
      owner: "@wayne",
      agents: ["claude-code"],
      skills: { "grappling-hook": "@wayne/skills/grappling-hook@^1.0.0" },
    });

    expect(decoded.owner).toBe("@wayne");
    expect(decoded.agents).toEqual(["claude-code"]);
    expect(decoded.skills).toBeDefined();
  });

  it("accepts lint configuration alongside other settings fields", () => {
    const decoded = Schema.decodeUnknownSync(SettingsSchema)({
      owner: "@acme",
      agents: ["cursor"],
      lint: { rules: { [SAMPLE_RULE_ID]: "off" } },
    });

    expect(decoded.owner).toBe("@acme");
    expect(decoded.lint?.rules?.[SAMPLE_RULE_ID]).toBe("off");
  });
});
