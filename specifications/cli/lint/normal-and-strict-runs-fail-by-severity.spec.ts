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
  requirement: "cli/lint/normal-and-strict-runs-fail-by-severity",
  title: "Lint fails a normal run on errors and a strict run on warnings as well",
  statement:
    "When lint finishes, a normal run shall fail only when an error finding exists, a --strict run shall fail when an error or warning finding exists, and both runs shall succeed on informational or no findings while reporting the same findings and summary.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "machine-automation"],
  methods: ["decision-table"],
  derivedFrom: ["cli/lint/honors-configured-rule-severities"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const targetRuleId = "workspace/skills-artifacts-correct";

const cases: ReadonlyArray<{
  readonly highest: "none" | "info" | "warning" | "error";
  readonly severity: ConfiguredLintSeverity;
  readonly exitCategory: "clean" | "warnings" | "errors";
  readonly normalSucceeds: boolean;
  readonly strictSucceeds: boolean;
}> = [
  {
    highest: "none",
    severity: "off",
    exitCategory: "clean",
    normalSucceeds: true,
    strictSucceeds: true,
  },
  {
    highest: "info",
    severity: "info",
    exitCategory: "clean",
    normalSucceeds: true,
    strictSucceeds: true,
  },
  {
    highest: "warning",
    severity: "warn",
    exitCategory: "warnings",
    normalSucceeds: true,
    strictSucceeds: false,
  },
  {
    highest: "error",
    severity: "error",
    exitCategory: "errors",
    normalSucceeds: false,
    strictSucceeds: false,
  },
];

describe("Lint run outcome", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect.each(cases)(
    "a highest finding severity of $highest decides the normal and strict outcomes",
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

        expect(normal.result.summary.exitCategory).toBe(testCase.exitCategory);
        expect(strict.result.findings).toEqual(normal.result.findings);
        expect(strict.result.summary).toEqual(normal.result.summary);

        expect(Exit.isSuccess(normal.exit)).toBe(testCase.normalSucceeds);
        expect(normal.ok).toBe(testCase.normalSucceeds);
        expect(Exit.isSuccess(strict.exit)).toBe(testCase.strictSucceeds);
        expect(strict.ok).toBe(testCase.strictSucceeds);
      }),
  );
});
