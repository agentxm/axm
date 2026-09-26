import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { lintProject, lintProjectWithHome, lintServices } from "../../test-helpers.js";
import { makeLintWorkspace } from "../../testing.js";

export const specification = defineSpecification({
  requirement: "cli/lint/reports-agent-content-without-settings",
  title: "Lint reports agent content in a project folder without workspace settings",
  statement:
    "When a project folder that is not the user home has no project workspace settings, lint shall report one warning per agent instruction file and per non-empty agent output directory under workspace/agent-content-has-settings naming its path, its entry count, and the agents that read it, as facts without commands; a folder with settings, or the user home itself, shall produce no such finding.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  boundary: "memory",
  boundaryRationale:
    "Agent content and missing settings are real files in a project folder on disk, decided against a separate user home; production lint observes them without creating settings.",
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const RULE_ID = "workspace/agent-content-has-settings";
const skill = (name: string) => `---\nname: ${name}\ndescription: Fixture\n---\n# Skill\n`;

describe("Agent content without settings", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("reports agent content only while the folder has no settings and is not home", () => {
    const project = makeLintWorkspace({
      files: { "CLAUDE.md": "# Guidance\n", ".claude/skills/foo/SKILL.md": skill("foo") },
    });
    project.remove("axm.json");
    const home = makeLintWorkspace();
    cleanups.push(project.cleanup, home.cleanup);
    const ruleFindings = (findings: ReadonlyArray<{ readonly ruleId: string }>) =>
      findings.filter(({ ruleId }) => ruleId === RULE_ID);
    return Effect.gen(function* () {
      const before = project.snapshot();
      const { document } = yield* lintProjectWithHome(project, home.root);
      const reported = ruleFindings(document.findings);
      expect(reported).toHaveLength(2);
      expect(
        document.findings
          .filter(({ ruleId }) => ruleId === RULE_ID)
          .map(({ severity, message, location }) => ({ severity, message, file: location?.file })),
      ).toEqual(
        expect.arrayContaining([
          {
            severity: "warning",
            message:
              "Agent instruction file CLAUDE.md for claude-code exists in a folder without project workspace settings (axm.json).",
            file: "CLAUDE.md",
          },
          {
            severity: "warning",
            message:
              "Agent skills directory .claude/skills with 1 entry for claude-code exists in a folder without project workspace settings (axm.json).",
            file: ".claude/skills",
          },
        ]),
      );
      expect(project.snapshot()).toEqual(before);

      const asHome = yield* lintProject(project);
      expect(ruleFindings(asHome.document.findings)).toEqual([]);

      project.writeSettings({});
      const configured = yield* lintProjectWithHome(project, home.root);
      expect(ruleFindings(configured.document.findings)).toEqual([]);
    }).pipe(Effect.provide(lintServices(project)));
  });
});
