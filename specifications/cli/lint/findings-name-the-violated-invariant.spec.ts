import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  installSkillWithMissingProjection,
  makeLintSpecWorkspace,
  runProjectLint,
} from "../../support/lint-harness.js";

export const specification = defineSpecification({
  requirement: "cli/lint/findings-name-the-violated-invariant",
  title: "Lint findings identify the violated invariant and affected subject as facts",
  statement:
    "When lint reports a finding in machine output mode, the finding shall carry a stable rule identity, the affected subject, the deciding authority, the observed state, the expected invariant, and its location.",
  class: "functional",
  role: "interface",
  goals: ["actionable-diagnostics", "machine-automation"],
  methods: ["contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Lint finding identity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect(
    "every machine finding names its invariant, subject, authority, evidence, and location",
    () =>
      Effect.gen(function* () {
        const workspace = makeLintSpecWorkspace({ machine: true, flags: { json: true } });
        cleanups.push(workspace.cleanup);
        yield* installSkillWithMissingProjection(workspace);

        const { result } = yield* runProjectLint(workspace, false);
        expect(result.findings.length).toBeGreaterThanOrEqual(1);
        const missingProjection = result.findings.filter(
          (finding) => finding.ruleId === "workspace/skills-artifacts-correct",
        );
        expect(missingProjection).toHaveLength(1);
        expect(missingProjection[0]).toMatchObject({
          ruleId: "workspace/skills-artifacts-correct",
          authority: "axm.json",
          observed: expect.stringContaining("code-review"),
          expected: "Skill directories match each skill's enabled state across declared agents.",
          path: expect.stringContaining("axm.json"),
        });
        expect(missingProjection[0]?.observed).toContain("claude-code");
        expect(missingProjection[0]?.observed).toMatch(/missing/i);

        for (const finding of result.findings) {
          expect(finding.ruleId, "stable rule identity").toMatch(/^[a-z0-9-]+(\/[a-z0-9-]+)+$/);
          expect(finding.subject.length, `subject of ${finding.ruleId}`).toBeGreaterThan(0);
          expect(finding.authority.length, `authority of ${finding.ruleId}`).toBeGreaterThan(0);
          expect(finding.observed.length, `observed state of ${finding.ruleId}`).toBeGreaterThan(0);
          expect(
            finding.expected.length,
            `expected invariant of ${finding.ruleId}`,
          ).toBeGreaterThan(0);
          expect(finding.path.length, `location of ${finding.ruleId}`).toBeGreaterThan(0);
        }
      }),
  );
});
