import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { lintProject, lintServices } from "../../test-helpers.js";
import {
  OFFICIAL_AXM_SKILL_PACKAGE_ROOT,
  isolateOfficialAxmSkillRules,
  makeOfficialAxmSkillWorkspace,
  type OfficialAxmSkillState,
} from "../../testing.js";

export const specification = defineSpecification({
  requirement: "cli/lint/compatibility-result-names-reason-and-recovery",
  title: "The machine lint result names the official skill's compatibility reason and recovery",
  statement:
    "When lint runs in machine output mode, the result shall carry a compatibility result only when the workspace declares the official AXM skill and its desired and accepted state select a package to assess, and that result shall describe that selected package: its source and version, the reason it is incompatible, and the recovery action for its source authority with its next command, or no action when it is compatible. When settings or accepted state prevent selecting a package, the result shall carry no compatibility result, the workspace shall remain declared, and the canonical-state finding shall name the cause.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  boundary: "memory",
  boundaryRationale:
    "The compatibility block is a field of the feature's own machine document, decided from the workspace's declaration and canonical package; the envelope that carries it is the CLI's concern, not this rule's.",
  methods: ["decision-table"],
  derivedFrom: [
    "cli/lint/official-skill-findings-follow-declared-intent",
    "cli/lint/declared-official-skill-must-be-compatible",
  ],
  supersedes: ["cli/lint/official-skill-findings-follow-declared-intent"],
  assumptions: [],
  openQuestions: [
    "The reason code reported for the authored and unreadable official-skill states is not pinned by the decision table, while every other error state pins one.",
  ],
});

const bundledInstallPreview = "axm skills install @agentxm/skills/axm --bundled --preview";

const cases: ReadonlyArray<{
  readonly state: OfficialAxmSkillState;
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
    state: "official-registry-beside-compatible-copy",
    compatibilityPresent: true,
    reasonCode: "cli-version-incompatible",
    recoveryAction: "update-registry-skill",
    nextAction: "axm skills update --name axm --preview",
  },
  {
    state: "official-registry-compatible-beside-stale-copy",
    compatibilityPresent: true,
    recoveryAction: "none",
    nextAction: null,
  },
  { state: "official-registry-unaccepted", compatibilityPresent: false },
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

  // `it.live`: a usable Registry package makes lint ask the (offline) Registry
  // about deprecation, whose bounded retries need a real clock.
  it.live.each(cases)("names the reason and recovery when $state", (testCase) => {
    const workspace = makeOfficialAxmSkillWorkspace(testCase.state, {
      settings: { lint: { rules: isolateOfficialAxmSkillRules() } },
    });
    cleanups.push(workspace.cleanup);

    return Effect.gen(function* () {
      const result = yield* lintProject(workspace);
      const document = result.document;

      expect(Object.hasOwn(document, "axmSkillCompatibility")).toBe(testCase.compatibilityPresent);
      if (testCase.reasonCode !== undefined) {
        expect(document.axmSkillCompatibility?.reasonCode).toBe(testCase.reasonCode);
      }
      if (testCase.recoveryAction !== undefined) {
        expect(document.axmSkillCompatibility?.recovery).toMatchObject({
          action: testCase.recoveryAction,
          nextAction: testCase.nextAction,
        });
      }
    }).pipe(Effect.provide(lintServices(workspace)));
  });

  it.live("describes the selected package, not another copy on disk", () => {
    const workspace = makeOfficialAxmSkillWorkspace("official-registry-beside-compatible-copy", {
      settings: { lint: { rules: isolateOfficialAxmSkillRules() } },
    });
    cleanups.push(workspace.cleanup);

    return Effect.gen(function* () {
      const result = yield* lintProject(workspace);

      expect(result.document.axmSkillCompatibility).toMatchObject({
        source: "agentxm:@agentxm/skills/axm",
        skillVersion: "0.0.1",
        declaredCliVersionRange: ">=0.0.1 <0.1.0",
      });
      expect(result.document.findings.map(({ location }) => location?.file)).toEqual([
        `${workspace.root}/${OFFICIAL_AXM_SKILL_PACKAGE_ROOT}`,
      ]);
    }).pipe(Effect.provide(lintServices(workspace)));
  });

  it.live("routes an unselectable declared package to its canonical-state finding", () => {
    const workspace = makeOfficialAxmSkillWorkspace("official-registry-unaccepted");
    cleanups.push(workspace.cleanup);

    return Effect.gen(function* () {
      const result = yield* lintProject(workspace);
      const ruleIds = result.document.findings.map(({ ruleId }) => ruleId);

      expect(Object.hasOwn(result.document, "axmSkillCompatibility")).toBe(false);
      expect(ruleIds).toContain("workspace/skills-lockfile-aligned");
      expect(ruleIds).not.toContain("workspace/axm-skill-declared");
      expect(ruleIds).not.toContain("workspace/axm-skill-compatible");
    }).pipe(Effect.provide(lintServices(workspace)));
  });
});
