import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { lintProject, lintServices, ruleSeverityRows } from "../../test-helpers.js";
import {
  isolateOfficialAxmSkillRules,
  makeOfficialAxmSkillWorkspace,
  type OfficialAxmSkillState,
} from "../../testing.js";

export const specification = defineSpecification({
  requirement: "cli/lint/declared-official-skill-must-be-compatible",
  title: "Lint holds a declared official AXM skill to compatibility",
  statement:
    "When the workspace declares the official AXM skill, lint shall report a compatibility error and fail when the declared skill is missing, incompatible, skewed, authored, or unreadable, and shall report clean and succeed when the skill and CLI satisfy the declared bounded compatibility range, including prerelease versions within that range.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  boundary: "memory",
  boundaryRationale:
    "Each state is a declaration plus a canonical package on a real workspace directory, evaluated against a pinned CLI release; the built executable adjudicates nothing this rule decides.",
  methods: ["decision-table"],
  derivedFrom: [
    "cli/lint/official-skill-findings-follow-declared-intent",
    "apps/cli/help/topics/upgrade.md",
    "apps/cli-e2e/src/lint/startup-check-does-not-hide-findings.e2e.test.ts",
  ],
  supersedes: ["cli/lint/official-skill-findings-follow-declared-intent"],
  assumptions: [],
  openQuestions: [],
});

// The built-CLI example this rule used to carry — that disabling the startup
// update check never hides a local compatibility finding — is a startup
// composition regression guard rather than a decision of this rule. It runs as
// ordinary process evidence in
// `apps/cli-e2e/src/lint/startup-check-does-not-hide-findings.e2e.test.ts`.

const compatibilityError = [["workspace/axm-skill-compatible", "error"]] as const;

const cases: ReadonlyArray<{
  readonly state: OfficialAxmSkillState;
  readonly findings: ReadonlyArray<readonly [ruleId: string, severity: string]>;
  readonly succeeds: boolean;
}> = [
  { state: "official-missing", findings: compatibilityError, succeeds: false },
  { state: "official-registry", findings: compatibilityError, succeeds: false },
  { state: "official-skewed", findings: compatibilityError, succeeds: false },
  { state: "official-authored", findings: compatibilityError, succeeds: false },
  { state: "official-compatible", findings: [], succeeds: true },
  { state: "official-compatible-prerelease", findings: [], succeeds: true },
  { state: "official-unreadable", findings: compatibilityError, succeeds: false },
];

describe("Declared official AXM skill", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect.each(cases)("is held to compatibility when $state", (testCase) => {
    const workspace = makeOfficialAxmSkillWorkspace(testCase.state, {
      settings: { lint: { rules: isolateOfficialAxmSkillRules() } },
    });
    cleanups.push(workspace.cleanup);

    return Effect.gen(function* () {
      const result = yield* lintProject(workspace);

      expect(ruleSeverityRows(result.document.findings)).toEqual(testCase.findings);
      expect(result.document.summary.exitCategory).toBe(testCase.succeeds ? "clean" : "errors");
      expect(result.outcome).toBe(testCase.succeeds ? "success" : "fail");
    }).pipe(Effect.provide(lintServices(workspace)));
  });
});
