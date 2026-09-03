import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
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
    "For each lint rule, lint shall report findings at the severity axm.json configures, suppress the rule when configured off, apply the catalog default when unconfigured, fail a normal run only on errors, and fail a --strict run on warnings as well.",
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
  readonly normalSucceeds: boolean;
  readonly strictSucceeds: boolean;
}> = [
  {
    configured: "absent",
    severity: undefined,
    emitted: "error",
    exitCategory: "errors",
    normalSucceeds: false,
    strictSucceeds: false,
  },
  {
    configured: "off",
    severity: "off",
    emitted: undefined,
    exitCategory: "clean",
    normalSucceeds: true,
    strictSucceeds: true,
  },
  {
    configured: "info",
    severity: "info",
    emitted: "info",
    exitCategory: "clean",
    normalSucceeds: true,
    strictSucceeds: true,
  },
  {
    configured: "warn",
    severity: "warn",
    emitted: "warning",
    exitCategory: "warnings",
    normalSucceeds: true,
    strictSucceeds: false,
  },
  {
    configured: "error",
    severity: "error",
    emitted: "error",
    exitCategory: "errors",
    normalSucceeds: false,
    strictSucceeds: false,
  },
];

describe("Configured local lint severity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect.each(cases)(
    "$configured controls the local finding and normal and strict outcomes",
    (testCase) =>
      Effect.gen(function* () {
        const rules = makeIsolatedLintRules(targetRuleId, testCase.severity);
        const workspace = makeLintSpecWorkspace({
          machine: true,
          flags: { json: true },
          settings: { lint: { rules } },
        });
        cleanups.push(workspace.cleanup);
        yield* installSkillWithMissingProjection(workspace);

        const normal = yield* runProjectLint(workspace, false);
        const strict = yield* runProjectLint(workspace, true);

        for (const result of [normal, strict]) {
          const targetFindings = result.result.findings.filter(
            ({ ruleId }) => ruleId === targetRuleId,
          );
          expect(targetFindings).toHaveLength(testCase.emitted === undefined ? 0 : 1);
          expect(targetFindings[0]?.severity).toBe(testCase.emitted);
          expect(result.result.findings).toEqual(targetFindings);
          expect(result.result.summary).toEqual({
            total: testCase.emitted === undefined ? 0 : 1,
            errors: testCase.emitted === "error" ? 1 : 0,
            warnings: testCase.emitted === "warning" ? 1 : 0,
            infos: testCase.emitted === "info" ? 1 : 0,
            exitCategory: testCase.exitCategory,
          });
        }

        expect(Exit.isSuccess(normal.exit)).toBe(testCase.normalSucceeds);
        expect(normal.ok).toBe(testCase.normalSucceeds);
        expect(Exit.isSuccess(strict.exit)).toBe(testCase.strictSucceeds);
        expect(strict.ok).toBe(testCase.strictSucceeds);
      }),
  );
});
