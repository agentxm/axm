/**
 * Unit tests for the v1 `workspace/*` rule catalog.
 *
 * The workspace catalog ships foundation, instruction, skills-install, and
 * packs-install rules. Rule ids and severities are public API (surfaced in
 * `axm.json` `lint.rules` and in the registry response bodies) —
 * this test pins both.
 */

import { describe, expect, it } from "vitest";
import { workspaceRules } from "./workspace.js";
import type { Severity } from "@agentxm/registry-protocol/unstable/lint/rule";

// Keep the id list in declaration order so a diff against the catalog file is
// a line-level comparison.
const EXPECTED: ReadonlyArray<{ readonly id: string; readonly severity: Severity }> = [
  // Foundation (classification-independent).
  { id: "workspace/initialized", severity: "error" },
  { id: "workspace/settings-schema-valid", severity: "error" },
  { id: "workspace/settings-keys-recognized", severity: "error" },
  { id: "workspace/lockfile-valid", severity: "error" },
  { id: "workspace/source-endpoints-aligned", severity: "error" },
  { id: "workspace/desired-state-reconcilable", severity: "error" },
  { id: "workspace/axm-skill-compatible", severity: "error" },
  { id: "workspace/agents-recognized", severity: "error" },
  { id: "workspace/agents-detected-declared", severity: "warning" },
  // Instruction files.
  { id: "workspace/instructions-source-present", severity: "error" },
  { id: "workspace/instructions-target-current", severity: "warning" },
  { id: "workspace/instructions-target-unowned", severity: "warning" },
  { id: "workspace/instructions-target-stale", severity: "warning" },
  { id: "workspace/instructions-agent-supported", severity: "warning" },
  { id: "workspace/instructions-gitignore-current", severity: "info" },
  // Aggregate managed outputs render complete contributor sets.
  { id: "workspace/projections-current", severity: "error" },
  { id: "workspace/hook-ownership-ambiguous", severity: "warning" },
  { id: "workspace/managed-file-unowned", severity: "warning" },
  // Declaration valid (configured).
  { id: "workspace/skills-declarations-valid", severity: "error" },
  { id: "workspace/packs-declarations-valid", severity: "error" },
  { id: "workspace/configured-but-not-installed", severity: "error" },
  { id: "workspace/knowledge-state-valid", severity: "error" },
  { id: "workspace/mcps-transport-exclusivity", severity: "warning" },
  { id: "workspace/mcps-no-secret-literal", severity: "warning" },
  { id: "workspace/mcps-shared-target-compatible", severity: "error" },
  { id: "workspace/mcps-agent-drift", severity: "warning" },
  { id: "workspace/mcps-agent-orphaned", severity: "warning" },
  // Lockfile aligned (configured).
  { id: "workspace/skills-lockfile-aligned", severity: "error" },
  // Integrity intact (configured + implicit).
  { id: "workspace/skills-integrity-valid", severity: "error" },
  // Artifacts correct (configured + implicit).
  { id: "workspace/skills-artifacts-correct", severity: "error" },
  // Pack dependencies resolved (configured packs).
  { id: "workspace/packs-dependencies-resolved", severity: "error" },
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

  it("registers fact-only advisory rules", () => {
    expect(workspaceRules.every((rule) => rule.kind === "advisory")).toBe(true);
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
