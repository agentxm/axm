/**
 * Unit tests for the v1 `workspace/*` rule catalog.
 *
 * The workspace catalog ships foundation, instruction, skills-install, and
 * packs-install rules. Rule ids and severities are public API (surfaced in
 * `axm.json` `lint.rules` and in the registry response bodies) —
 * this test pins both.
 */

import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import { fileURLToPath } from "node:url";
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

interface EvidencePointer {
  readonly path: string;
  readonly needle: string;
}

interface WorkspaceRuleConformanceEvidence {
  readonly ruleId: string;
  readonly satisfied: EvidencePointer;
  readonly violated: EvidencePointer;
  readonly prerequisite?: EvidencePointer;
}

const cleanWorkspaceEvidence: EvidencePointer = {
  path: "packages/cli/src/root/lint/handler.internal.test.ts",
  needle: "clean workspace exits zero",
};

const evidence = (
  ruleId: string,
  path: string,
  needle: string = ruleId,
): WorkspaceRuleConformanceEvidence => ({
  ruleId,
  satisfied: cleanWorkspaceEvidence,
  violated: { path, needle },
});

/**
 * Traceability from every workspace predicate to executable satisfied and
 * violated scenarios. Focused suites keep their branch detail; this registry
 * owns exact catalog completeness so a new rule cannot rely on a snapshot
 * alone.
 */
const WORKSPACE_RULE_CONFORMANCE: ReadonlyArray<WorkspaceRuleConformanceEvidence> = [
  evidence(
    "workspace/initialized",
    "packages/workspace-lint/src/catalog/workspace/conformance/foundation/test-helpers.ts",
    "initializedConformance",
  ),
  evidence(
    "workspace/settings-schema-valid",
    "packages/workspace-lint/src/catalog/workspace/conformance/foundation/test-helpers.ts",
    "settingsSchemaValidConformance",
  ),
  evidence(
    "workspace/settings-keys-recognized",
    "packages/workspace-lint/src/catalog/workspace/conformance/workspace-state/test-helpers.ts",
    "settingsKeysRecognizedConformance",
  ),
  evidence(
    "workspace/lockfile-valid",
    "packages/workspace-lint/src/catalog/workspace/conformance/foundation/test-helpers.ts",
    "lockfileValidConformance",
  ),
  evidence(
    "workspace/source-endpoints-aligned",
    "packages/workspace-lint/src/catalog/workspace/conformance/reconciliation/test-helpers.ts",
    "sourceEndpointsAlignedConformance",
  ),
  evidence(
    "workspace/desired-state-reconcilable",
    "packages/workspace-lint/src/catalog/workspace/conformance/reconciliation/test-helpers.ts",
    "desiredStateReconcilableConformance",
  ),
  evidence(
    "workspace/axm-skill-compatible",
    "packages/workspace-lint/src/catalog/workspace/axm-skill-compatible.internal.test.ts",
  ),
  evidence(
    "workspace/agents-recognized",
    "packages/workspace-lint/src/catalog/workspace/conformance/foundation/test-helpers.ts",
    "agentsRecognizedConformance",
  ),
  evidence(
    "workspace/agents-detected-declared",
    "packages/workspace-lint/src/catalog/workspace/agents-detected-declared.internal.test.ts",
  ),
  evidence(
    "workspace/instructions-source-present",
    "packages/workspace-lint/src/catalog/workspace/conformance/instructions/test-helpers.ts",
    "instructionsSourcePresentConformance",
  ),
  evidence(
    "workspace/instructions-target-current",
    "packages/workspace-lint/src/catalog/workspace/conformance/instructions/test-helpers.ts",
    "instructionsTargetCurrentConformance",
  ),
  evidence(
    "workspace/instructions-target-unowned",
    "packages/workspace-lint/src/catalog/workspace/conformance/instructions/test-helpers.ts",
    "instructionsTargetUnownedConformance",
  ),
  evidence(
    "workspace/instructions-target-stale",
    "packages/workspace-lint/src/catalog/workspace/conformance/instructions/test-helpers.ts",
    "instructionsTargetStaleConformance",
  ),
  evidence(
    "workspace/instructions-agent-supported",
    "packages/workspace-lint/src/catalog/workspace/conformance/instructions/test-helpers.ts",
    "instructionsAgentSupportedConformance",
  ),
  evidence(
    "workspace/instructions-gitignore-current",
    "packages/workspace-lint/src/catalog/workspace/conformance/instructions/test-helpers.ts",
    "instructionsGitignoreCurrentConformance",
  ),
  evidence(
    "workspace/projections-current",
    "packages/workspace-lint/src/catalog/workspace/conformance/workspace-state/test-helpers.ts",
    "projectionsCurrentConformance",
  ),
  evidence(
    "workspace/hook-ownership-ambiguous",
    "packages/workspace-lint/src/catalog/workspace/conformance/workspace-state/test-helpers.ts",
    "hookOwnershipAmbiguousConformance",
  ),
  evidence(
    "workspace/managed-file-unowned",
    "packages/workspace-lint/src/catalog/workspace/conformance/workspace-state/test-helpers.ts",
    "managedFileUnownedConformance",
  ),
  evidence(
    "workspace/skills-declarations-valid",
    "packages/workspace-lint/src/catalog/workspace/conformance/foundation/test-helpers.ts",
    "skillsDeclarationsValidConformance",
  ),
  evidence(
    "workspace/packs-declarations-valid",
    "packages/workspace-lint/src/catalog/workspace/conformance/foundation/test-helpers.ts",
    "packsDeclarationsValidConformance",
  ),
  evidence(
    "workspace/configured-but-not-installed",
    "packages/workspace-lint/src/catalog/workspace/configured-but-not-installed.internal.test.ts",
  ),
  evidence(
    "workspace/knowledge-state-valid",
    "packages/workspace-lint/src/catalog/workspace/conformance/workspace-state/test-helpers.ts",
    "knowledgeStateValidConformance",
  ),
  evidence(
    "workspace/mcps-transport-exclusivity",
    "packages/workspace-lint/src/catalog/workspace/conformance/foundation/test-helpers.ts",
    "mcpTransportExclusivityConformance",
  ),
  evidence(
    "workspace/mcps-no-secret-literal",
    "packages/workspace-lint/src/catalog/workspace/conformance/foundation/test-helpers.ts",
    "mcpNoSecretLiteralConformance",
  ),
  evidence(
    "workspace/mcps-shared-target-compatible",
    "packages/cli-e2e/src/cli-commands/lint/command.e2e.ts",
  ),
  evidence(
    "workspace/mcps-agent-drift",
    "packages/workspace-lint/src/catalog/workspace/mcps-agent-drift.internal.test.ts",
  ),
  evidence(
    "workspace/mcps-agent-orphaned",
    "packages/workspace-lint/src/catalog/workspace/mcps-agent-orphaned.internal.test.ts",
  ),
  evidence(
    "workspace/skills-lockfile-aligned",
    "packages/workspace-lint/src/catalog/workspace/skills-lockfile-aligned.internal.test.ts",
  ),
  evidence(
    "workspace/skills-integrity-valid",
    "packages/workspace-lint/src/catalog/workspace/skills-integrity-valid.internal.test.ts",
  ),
  evidence(
    "workspace/skills-artifacts-correct",
    "specifications/cli/lint/honors-configured-rule-severities.spec.ts",
  ),
  evidence(
    "workspace/packs-dependencies-resolved",
    "packages/cli-e2e/src/cli-commands/packs/packs.e2e.ts",
  ),
];

const missingConformanceEvidence = (
  ruleIds: ReadonlyArray<string>,
  conformance: ReadonlyArray<WorkspaceRuleConformanceEvidence>,
): ReadonlyArray<string> => {
  const registered = new Set(conformance.map(({ ruleId }) => ruleId));
  return ruleIds.filter((ruleId) => !registered.has(ruleId));
};

const repositoryRoot = nodePath.resolve(
  nodePath.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

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

  it("binds every workspace rule exactly once to satisfied and violated evidence", () => {
    const ruleIds = workspaceRules.map(({ id }) => id);
    const evidenceIds = WORKSPACE_RULE_CONFORMANCE.map(({ ruleId }) => ruleId);
    expect(evidenceIds).toEqual(ruleIds);
    expect(new Set(evidenceIds).size).toBe(evidenceIds.length);
    expect(missingConformanceEvidence(ruleIds, WORKSPACE_RULE_CONFORMANCE)).toEqual([]);
  });

  it("fails conformance completeness for a test-only unregistered rule", () => {
    expect(
      missingConformanceEvidence(
        [...workspaceRules.map(({ id }) => id), "workspace/test-only-unregistered"],
        WORKSPACE_RULE_CONFORMANCE,
      ),
    ).toEqual(["workspace/test-only-unregistered"]);
  });

  it("keeps every conformance pointer bound to executable source evidence", () => {
    for (const entry of WORKSPACE_RULE_CONFORMANCE) {
      for (const pointer of [entry.satisfied, entry.violated, entry.prerequisite].filter(
        (value): value is EvidencePointer => value !== undefined,
      )) {
        const absolutePath = nodePath.join(repositoryRoot, pointer.path);
        expect(nodeFs.existsSync(absolutePath), pointer.path).toBe(true);
        expect(nodeFs.readFileSync(absolutePath, "utf8"), pointer.path).toContain(pointer.needle);
      }
    }
  });
});
