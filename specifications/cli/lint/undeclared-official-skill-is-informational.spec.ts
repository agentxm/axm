import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  makeOfficialSkillWorkspace,
  runProjectLint,
  type OfficialSkillWorkspaceState,
} from "../../support/lint-harness.js";

export const specification = defineSpecification({
  requirement: "cli/lint/undeclared-official-skill-is-informational",
  title: "Lint reports an undeclared official AXM skill as informational",
  statement:
    "When the workspace does not declare the official AXM skill, lint shall report one informational finding for the declared-skill rule, shall report no compatibility finding, and shall succeed.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["decision-table"],
  derivedFrom: ["cli/lint/official-skill-findings-follow-declared-intent"],
  supersedes: ["cli/lint/official-skill-findings-follow-declared-intent"],
  assumptions: [],
  openQuestions: [],
});

const cases: ReadonlyArray<{ readonly state: OfficialSkillWorkspaceState }> = [
  { state: "undeclared" },
  { state: "non-official" },
];

describe("Undeclared official AXM skill", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect.each(cases)("is informational when the workspace is $state", ({ state }) =>
    Effect.gen(function* () {
      const workspace = yield* makeOfficialSkillWorkspace(state);
      cleanups.push(workspace.cleanup);

      const result = yield* runProjectLint(workspace, false);
      expect(result.result.findings.map(({ ruleId, severity }) => [ruleId, severity])).toEqual([
        ["workspace/axm-skill-declared", "info"],
      ]);
      expect(result.result.summary.exitCategory).toBe("clean");
      expect(result.ok).toBe(true);
      expect(Exit.isSuccess(result.exit)).toBe(true);
    }),
  );
});
