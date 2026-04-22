/**
 * Unit tests for the v1 `workspace/*` rule catalog.
 *
 * The v1 catalog ships exactly 13 rules (foundation 5 + skills-install 5 +
 * packs-install 3). Rule ids and severities are public API (surfaced in
 * `.axm/settings.json` `lint.rules` and in the registry response bodies) —
 * this test pins both.
 */

import { describe, expect, it } from "vitest";
import { workspaceRules } from "./workspace.js";
import type { Severity } from "../rule.js";

// Keep the id list in declaration order so a diff against the catalog file is
// a line-level comparison.
const EXPECTED: ReadonlyArray<{ readonly id: string; readonly severity: Severity }> = [
  // Foundation
  { id: "workspace/initialized", severity: "error" },
  { id: "workspace/settings-schema-valid", severity: "error" },
  { id: "workspace/lockfile-valid", severity: "error" },
  { id: "workspace/agents-recognized", severity: "error" },
  { id: "workspace/agents-detected-declared", severity: "warning" },
  // Skills install family
  { id: "workspace/skills-declarations-valid", severity: "error" },
  { id: "workspace/skills-lockfile-aligned", severity: "error" },
  { id: "workspace/skills-integrity-valid", severity: "error" },
  { id: "workspace/skills-artifacts-correct", severity: "error" },
  { id: "workspace/skills-artifacts-clean", severity: "error" },
  // Packs install family
  { id: "workspace/packs-declarations-valid", severity: "error" },
  { id: "workspace/packs-dependencies-resolved", severity: "error" },
  { id: "workspace/packs-members-retained", severity: "warning" },
];

describe("workspaceRules", () => {
  it("exports exactly the v1 13-rule set", () => {
    expect(workspaceRules.map((r) => r.id)).toEqual(EXPECTED.map((r) => r.id));
  });

  it("pins the platform-canonical severity of each rule", () => {
    for (const rule of workspaceRules) {
      const expected = EXPECTED.find((r) => r.id === rule.id);
      expect(
        expected,
        `rule ${rule.id} missing from EXPECTED; update the test first`,
      ).toBeDefined();
      if (expected !== undefined) {
        expect(rule.severity, `severity for ${rule.id}`).toBe(expected.severity);
      }
    }
  });

  it("registers the expected autofixing rule-ids", () => {
    const autofixingIds = workspaceRules.filter((r) => r.kind === "autofixing").map((r) => r.id);
    expect(autofixingIds).toEqual([
      "workspace/lockfile-valid",
      "workspace/skills-lockfile-aligned",
      "workspace/skills-integrity-valid",
      "workspace/skills-artifacts-correct",
      "workspace/skills-artifacts-clean",
    ]);
  });

  it("every rule id is namespaced under workspace/", () => {
    for (const rule of workspaceRules) {
      expect(rule.id.startsWith("workspace/")).toBe(true);
    }
  });

  it("every rule has a non-empty one-sentence description", () => {
    for (const rule of workspaceRules) {
      expect(rule.description.length, `rule ${rule.id}`).toBeGreaterThan(0);
      expect(rule.description.length, `rule ${rule.id} description too long`).toBeLessThanOrEqual(
        100,
      );
    }
  });
});
