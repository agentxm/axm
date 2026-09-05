import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  makeOfficialSkillWorkspace,
  runProjectLint,
  type OfficialSkillWorkspaceState,
} from "../../support/lint-harness.js";

export const specification = defineSpecification({
  requirement: "cli/lint/compatibility-result-names-reason-and-recovery",
  title: "The machine lint result names the official skill's compatibility reason and recovery",
  statement:
    "When lint runs in machine output mode, the result shall carry a compatibility result only when the workspace declares the official AXM skill, and that result shall name the reason the skill is incompatible and the recovery action with its next command, or no action when the skill is compatible.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["decision-table"],
  derivedFrom: ["cli/lint/official-skill-findings-follow-declared-intent"],
  supersedes: ["cli/lint/official-skill-findings-follow-declared-intent"],
  assumptions: [],
  openQuestions: [
    "The reason code reported for the authored and unreadable official-skill states is not pinned by the decision table, while every other error state pins one.",
  ],
});

const bundledInstallPreview = "axm skills install @agentxm/skills/axm --bundled --preview";

const cases: ReadonlyArray<{
  readonly state: OfficialSkillWorkspaceState;
  readonly compatibilityPresent: boolean;
  readonly reasonCode?: string;
  readonly recoveryAction?: string;
  readonly nextAction?: string | null;
}> = [
  { state: "undeclared", compatibilityPresent: false },
  { state: "non-official", compatibilityPresent: false },
  {
    state: "official-missing",
    compatibilityPresent: true,
    reasonCode: "axm-skill-missing",
    recoveryAction: "install-bundled-skill",
    nextAction: bundledInstallPreview,
  },
  {
    state: "official-registry",
    compatibilityPresent: true,
    reasonCode: "cli-version-incompatible",
    recoveryAction: "update-registry-skill",
    nextAction: "axm skills update --name axm --preview",
  },
  {
    state: "official-skewed",
    compatibilityPresent: true,
    reasonCode: "skill-release-mismatch",
    recoveryAction: "install-bundled-skill",
    nextAction: bundledInstallPreview,
  },
  {
    state: "official-authored",
    compatibilityPresent: true,
    recoveryAction: "preserve-authored-skill",
    nextAction: "axm help upgrade",
  },
  {
    state: "official-compatible",
    compatibilityPresent: true,
    recoveryAction: "none",
    nextAction: null,
  },
  {
    state: "official-unreadable",
    compatibilityPresent: true,
    recoveryAction: "install-bundled-skill",
    nextAction: bundledInstallPreview,
  },
];

describe("Official AXM skill compatibility result", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect.each(cases)("names the reason and recovery when $state", (testCase) =>
    Effect.gen(function* () {
      const workspace = yield* makeOfficialSkillWorkspace(testCase.state);
      cleanups.push(workspace.cleanup);

      const { result } = yield* runProjectLint(workspace, false);
      expect(Object.hasOwn(result, "axmSkillCompatibility")).toBe(testCase.compatibilityPresent);
      if (testCase.reasonCode !== undefined) {
        expect(result.axmSkillCompatibility?.reasonCode).toBe(testCase.reasonCode);
      }
      if (testCase.recoveryAction !== undefined) {
        expect(result.axmSkillCompatibility?.recovery).toMatchObject({
          action: testCase.recoveryAction,
          nextAction: testCase.nextAction,
        });
      }
    }),
  );
});
