import * as fs from "node:fs";
import * as path from "node:path";
import { makeEnvironmentProcessFixture } from "../../support/environment-process-fixture.js";
import { snapshotWorkspaceContent } from "../../support/workspace-fixtures.js";
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
  requirement: "cli/lint/declared-official-skill-must-be-compatible",
  title: "Lint holds a declared official AXM skill to compatibility",
  statement:
    "When the workspace declares the official AXM skill, lint shall report a compatibility error and fail when the declared skill is missing, incompatible, skewed, authored, or unreadable, and shall report clean and succeed when the skill and CLI satisfy the declared bounded compatibility range, including prerelease versions within that range.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  boundary: "process",
  boundaryRationale:
    "A fresh built CLI invocation with startup checks disabled establishes that the registered lint path still reports a missing official skill and preserves the workspace; existing direct cases distinguish the remaining compatibility states.",
  methods: ["decision-table", "example"],
  derivedFrom: [
    "cli/lint/official-skill-findings-follow-declared-intent",
    "packages/cli/help/topics/upgrade.md",
  ],
  supersedes: ["cli/lint/official-skill-findings-follow-declared-intent"],
  assumptions: [],
  openQuestions: [],
});

const compatibilityError = [["workspace/axm-skill-compatible", "error"]] as const;

const cases: ReadonlyArray<{
  readonly state: OfficialSkillWorkspaceState;
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

  it.effect.each(cases)("is held to compatibility when $state", (testCase) =>
    Effect.gen(function* () {
      const workspace = yield* makeOfficialSkillWorkspace(testCase.state);
      cleanups.push(workspace.cleanup);

      const result = yield* runProjectLint(workspace, false);
      expect(result.result.findings.map(({ ruleId, severity }) => [ruleId, severity])).toEqual(
        testCase.findings,
      );
      expect(result.result.summary.exitCategory).toBe(testCase.succeeds ? "clean" : "errors");
      expect(result.ok).toBe(testCase.succeeds);
      expect(Exit.isSuccess(result.exit)).toBe(testCase.succeeds);
    }),
  );
  it("disabling the startup update check does not hide local compatibility findings", async () => {
    const fixture = makeEnvironmentProcessFixture();
    try {
      fs.writeFileSync(
        path.join(fixture.invoking, "axm.json"),
        JSON.stringify({ agents: [], skills: { axm: "@agentxm/skills/axm" } }),
      );
      const before = snapshotWorkspaceContent(fixture.invoking);
      const result = await fixture.run(["lint", "--json"], { AXM_NO_UPDATE_CHECK: "1" });
      const document: unknown = JSON.parse(result.stdout);
      expect(document).toMatchObject({
        result: {
          axmSkillCompatibility: { reasonCode: "axm-skill-missing" },
          findings: expect.arrayContaining([
            expect.objectContaining({
              ruleId: "workspace/axm-skill-compatible",
              severity: "error",
            }),
          ]),
        },
      });
      expect(result.exitCode).toBe(1);
      expect(snapshotWorkspaceContent(fixture.invoking)).toEqual(before);
    } finally {
      fixture.cleanup();
    }
  });
});
