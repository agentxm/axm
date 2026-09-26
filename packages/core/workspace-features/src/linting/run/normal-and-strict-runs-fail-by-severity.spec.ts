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
  requirement: "cli/lint/normal-and-strict-runs-fail-by-severity",
  title: "Lint fails a normal run on errors and a strict run on warnings as well",
  statement:
    "When lint finishes, a normal run shall fail only when an error finding exists, a --strict run shall fail when an error or warning finding exists, and both runs shall succeed on informational or no findings while reporting the same findings and summary.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "machine-automation"],
  boundary: "memory",
  boundaryRationale:
    "The pass/fail verdict is the feature's own typed outcome; mapping it onto a process exit code is the CLI's separate rule.",
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
    (testCase) => {
      const workspace = makeOfficialAxmSkillWorkspace("official-compatible", {
        settings: { lint: { rules: isolatedLintRules(targetRuleId, testCase.severity) } },
      });
      cleanups.push(workspace.cleanup);
      workspace.remove(`${CLAUDE_CODE_SKILLS_DIR}/axm`);

      return Effect.gen(function* () {
        const normal = yield* lintProject(workspace);
        const strict = yield* lintProject(workspace, { strict: true });

        expect(normal.document.summary.exitCategory).toBe(testCase.exitCategory);
        expect(strict.document.findings).toEqual(normal.document.findings);
        expect(strict.document.summary).toEqual(normal.document.summary);

        expect(normal.outcome).toBe(testCase.normalSucceeds ? "success" : "fail");
        expect(strict.outcome).toBe(testCase.strictSucceeds ? "success" : "fail");
      }).pipe(Effect.provide(lintServices(workspace)));
    },
  );
});
