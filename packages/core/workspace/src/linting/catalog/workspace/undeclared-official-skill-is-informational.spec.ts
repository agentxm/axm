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
  requirement: "cli/lint/undeclared-official-skill-is-informational",
  title: "Lint reports an undeclared official AXM skill as informational",
  statement:
    "When the workspace does not declare the official AXM skill, lint shall report one informational finding for the declared-skill rule, shall report no compatibility finding, and shall succeed.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  boundary: "memory",
  boundaryRationale:
    "The rule reads a declaration and a canonical package off a real workspace directory; nothing about it needs a process.",
  methods: ["decision-table"],
  derivedFrom: ["cli/lint/official-skill-findings-follow-declared-intent"],
  supersedes: ["cli/lint/official-skill-findings-follow-declared-intent"],
  assumptions: [],
  openQuestions: [],
});

const cases: ReadonlyArray<{ readonly state: OfficialAxmSkillState }> = [
  { state: "undeclared" },
  { state: "non-official" },
];

describe("Undeclared official AXM skill", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect.each(cases)("is informational when the workspace is $state", ({ state }) => {
    const workspace = makeOfficialAxmSkillWorkspace(state, {
      settings: { lint: { rules: isolateOfficialAxmSkillRules() } },
    });
    cleanups.push(workspace.cleanup);

    return Effect.gen(function* () {
      const result = yield* lintProject(workspace);

      expect(ruleSeverityRows(result.document.findings)).toEqual([
        ["workspace/axm-skill-declared", "info"],
      ]);
      expect(result.document.summary.exitCategory).toBe("clean");
      expect(result.outcome).toBe("success");
    }).pipe(Effect.provide(lintServices(workspace)));
  });
});
