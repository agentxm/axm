import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  installSkillWithMissingProjection,
  makeIsolatedLintRules,
  makeLintSpecWorkspace,
  runProjectLint,
  type ConfiguredLintSeverity,
} from "../../support/lint-harness.js";

export const specification = defineSpecification({
  requirement: "cli/lint/honors-configured-rule-severities",
  title: "Local lint honors configured rule severities",
  statement:
    "For each lint rule, lint shall report findings at the severity axm.json configures, suppress the rule when configured off, and apply the catalog default when unconfigured.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity"],
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

  it.effect.each(cases)("$configured controls the reported finding and summary", (testCase) =>
    Effect.gen(function* () {
      const rules = makeIsolatedLintRules(targetRuleId, testCase.severity);
      const workspace = makeLintSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: { lint: { rules } },
      });
      cleanups.push(workspace.cleanup);
      yield* installSkillWithMissingProjection(workspace);

      const { result } = yield* runProjectLint(workspace, false);

      const targetFindings = result.findings.filter(({ ruleId }) => ruleId === targetRuleId);
      expect(targetFindings).toHaveLength(testCase.emitted === undefined ? 0 : 1);
      expect(targetFindings[0]?.severity).toBe(testCase.emitted);
      expect(result.findings).toEqual(targetFindings);
      expect(result.summary).toEqual({
        total: testCase.emitted === undefined ? 0 : 1,
        errors: testCase.emitted === "error" ? 1 : 0,
        warnings: testCase.emitted === "warning" ? 1 : 0,
        infos: testCase.emitted === "info" ? 1 : 0,
        exitCategory: testCase.exitCategory,
      });
    }),
  );
});
