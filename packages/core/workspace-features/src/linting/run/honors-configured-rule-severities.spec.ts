import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { lintProject, lintServices } from "../test-helpers.js";
import {
  CLAUDE_CODE_SKILLS_DIR,
  isolatedLintRules,
  makeOfficialAxmSkillWorkspace,
  type ConfiguredLintSeverity,
} from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/lint/honors-configured-rule-severities",
  title: "Local lint honors configured rule severities",
  statement:
    "For each lint rule, lint shall report findings at the severity axm.json configures, suppress the rule when configured off, and apply the catalog default when unconfigured.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity"],
  boundary: "memory",
  boundaryRationale:
    "Severity resolution reads the workspace's own settings document and decides the reported finding and summary; no process boundary adjudicates it.",
  methods: ["decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const targetRuleId = "workspace/skills-artifacts-correct";

const cases: ReadonlyArray<{
  readonly configured: string;
  readonly severity: ConfiguredLintSeverity | undefined;
  readonly emitted: "error" | "warning" | "info" | undefined;
  readonly exitCategory: "clean" | "warnings" | "errors";
}> = [
  { configured: "absent", severity: undefined, emitted: "error", exitCategory: "errors" },
  { configured: "off", severity: "off", emitted: undefined, exitCategory: "clean" },
  { configured: "info", severity: "info", emitted: "info", exitCategory: "clean" },
  { configured: "warn", severity: "warn", emitted: "warning", exitCategory: "warnings" },
  { configured: "error", severity: "error", emitted: "error", exitCategory: "errors" },
];

describe("Configured local lint severity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect.each(cases)("$configured controls the reported finding and summary", (testCase) => {
    const workspace = makeOfficialAxmSkillWorkspace("official-compatible", {
      settings: { lint: { rules: isolatedLintRules(targetRuleId, testCase.severity) } },
    });
    cleanups.push(workspace.cleanup);
    // One deterministic violation of the configured rule: the declared skill
    // is missing from the one agent this workspace configures.
    workspace.remove(`${CLAUDE_CODE_SKILLS_DIR}/axm`);

    return Effect.gen(function* () {
      const { document } = yield* lintProject(workspace);

      const targetFindings = document.findings.filter(({ ruleId }) => ruleId === targetRuleId);
      expect(targetFindings).toHaveLength(testCase.emitted === undefined ? 0 : 1);
      expect(targetFindings[0]?.severity).toBe(testCase.emitted);
      expect(document.findings).toEqual(targetFindings);
      expect(document.summary).toEqual({
        total: testCase.emitted === undefined ? 0 : 1,
        errors: testCase.emitted === "error" ? 1 : 0,
        warnings: testCase.emitted === "warning" ? 1 : 0,
        infos: testCase.emitted === "info" ? 1 : 0,
        exitCategory: testCase.exitCategory,
      });
    }).pipe(Effect.provide(lintServices(workspace)));
  });
});
