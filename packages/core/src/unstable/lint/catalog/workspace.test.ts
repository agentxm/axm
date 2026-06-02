/**
 * Unit tests for the v1 `workspace/*` rule catalog.
 *
 * The workspace catalog ships foundation, instruction, skills-install, and
 * packs-install rules. Rule ids and severities are public API (surfaced in
 * `.axm/settings.json` `lint.rules` and in the registry response bodies) —
 * this test pins both.
 */

import { describe, expect, it } from "vitest";
import { workspaceRules } from "./workspace.js";
import type { Severity } from "../rule.js";

// Keep the id list in declaration order so a diff against the catalog file is
// a line-level comparison.
const EXPECTED: ReadonlyArray<{ readonly id: string; readonly severity: Severity }> = [
  // Foundation (classification-independent).
  { id: "workspace/initialized", severity: "error" },
  { id: "workspace/settings-schema-valid", severity: "error" },
  { id: "workspace/lockfile-valid", severity: "error" },
  { id: "workspace/agents-recognized", severity: "error" },
  { id: "workspace/agents-detected-declared", severity: "warning" },
  // Instruction files.
  { id: "workspace/instructions-source-present", severity: "error" },
  { id: "workspace/instructions-target-current", severity: "warning" },
  { id: "workspace/instructions-agent-supported", severity: "warning" },
  { id: "workspace/instructions-gitignore-current", severity: "info" },
  // Declaration valid (configured).
  { id: "workspace/skills-declarations-valid", severity: "error" },
  { id: "workspace/packs-declarations-valid", severity: "error" },
  { id: "workspace/configured-but-not-installed", severity: "error" },
  { id: "workspace/mcp-server-transport-exclusivity", severity: "warning" },
  { id: "workspace/mcp-server-no-secret-literal", severity: "warning" },
  // Lockfile aligned (configured).
  { id: "workspace/skills-lockfile-aligned", severity: "error" },
  // Integrity intact (configured + implicit).
  { id: "workspace/skills-integrity-valid", severity: "error" },
  // Universal artifact present (configured + implicit).
  { id: "workspace/skills-universal-artifact-present", severity: "error" },
  // Artifacts correct (configured + implicit).
  { id: "workspace/skills-artifacts-correct", severity: "error" },
  // Managed — unmanaged class must be empty.
  { id: "workspace/skills-managed", severity: "error" },
  // Pack dependencies resolved (configured packs).
  { id: "workspace/packs-dependencies-resolved", severity: "error" },
  // Implicit retained by pack.
  { id: "workspace/packs-members-retained", severity: "warning" },
];

describe("workspaceRules", () => {
  it("exports exactly the workspace rule set", () => {
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
      "workspace/instructions-target-current",
      "workspace/instructions-gitignore-current",
      "workspace/skills-lockfile-aligned",
      "workspace/skills-integrity-valid",
      "workspace/skills-universal-artifact-present",
      "workspace/skills-artifacts-correct",
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
