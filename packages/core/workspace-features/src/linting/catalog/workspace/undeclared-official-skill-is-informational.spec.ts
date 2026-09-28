import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { lintProject, lintServices, ruleSeverityRows } from "../../test-helpers.js";
import {
  EXTRANEOUS_AXM_SKILL_PACKAGE_ROOT,
  FIXTURE_CLI_VERSION,
  FIXTURE_CLI_VERSION_RANGE,
  OFFICIAL_AXM_SKILL_PACKAGE_ROOT,
  isolateOfficialAxmSkillRules,
  makeOfficialAxmSkillWorkspace,
  officialAxmSkillPackage,
  type OfficialAxmSkillState,
} from "../../testing.js";

export const specification = defineSpecification({
  requirement: "cli/lint/undeclared-official-skill-is-informational",
  title: "Lint reports an undeclared official AXM skill as informational",
  statement:
    "When the workspace does not declare the official AXM skill, lint shall report one informational finding for the declared-skill rule, shall report no compatibility finding or compatibility result, and shall succeed; official-skill content that happens to be on disk, or another owner's skill named axm, shall not change that.",
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

/**
 * Official-skill packages nothing declares: a compatible one where the
 * Registry would place it, and an incompatible one an older layout left.
 */
const incidentalOfficialContent = {
  ...officialAxmSkillPackage({
    packageRoot: OFFICIAL_AXM_SKILL_PACKAGE_ROOT,
    version: FIXTURE_CLI_VERSION,
    metadata: { cliVersion: FIXTURE_CLI_VERSION, cliVersionRange: FIXTURE_CLI_VERSION_RANGE },
  }),
  ...officialAxmSkillPackage({
    packageRoot: EXTRANEOUS_AXM_SKILL_PACKAGE_ROOT,
    version: "0.0.1",
    metadata: { cliVersion: "0.0.1", cliVersionRange: ">=0.0.1 <0.1.0" },
  }),
};

const cases: ReadonlyArray<{
  readonly state: OfficialAxmSkillState;
  readonly content: "no" | "incidental";
}> = [
  { state: "undeclared", content: "no" },
  { state: "undeclared", content: "incidental" },
  { state: "non-official", content: "no" },
  { state: "non-official", content: "incidental" },
];

describe("Undeclared official AXM skill", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect.each(cases)(
    "is informational when the workspace is $state with $content official content",
    ({ state, content }) => {
      const workspace = makeOfficialAxmSkillWorkspace(state, {
        settings: { lint: { rules: isolateOfficialAxmSkillRules() } },
        ...(content === "incidental" ? { files: incidentalOfficialContent } : {}),
      });
      cleanups.push(workspace.cleanup);

      return Effect.gen(function* () {
        const result = yield* lintProject(workspace);

        expect(ruleSeverityRows(result.document.findings)).toEqual([
          ["workspace/axm-skill-declared", "info"],
        ]);
        expect(result.document.axmSkillCompatibility).toBeUndefined();
        expect(result.document.summary.exitCategory).toBe("clean");
        expect(result.outcome).toBe("success");
      }).pipe(Effect.provide(lintServices(workspace)));
    },
  );
});
