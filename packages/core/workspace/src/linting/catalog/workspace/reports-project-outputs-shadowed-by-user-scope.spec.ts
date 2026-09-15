import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { lintProject, lintProjectWithHome, lintServices } from "../../test-helpers.js";
import { isolatedLintRules, makeLintWorkspace } from "../../testing.js";

export const specification = defineSpecification({
  requirement: "cli/lint/reports-project-outputs-shadowed-by-user-scope",
  title: "Lint reports project agent outputs that share a name with a user-scope output",
  statement:
    "When a project agent skill or subagent output shares its name with a user-scope output that the same agent reads, lint shall report one warning per such pair under workspace/project-outputs-not-shadowed naming the type, the name, both paths, and the agents that read both, as facts without commands.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "agent-interoperability"],
  methods: ["example"],
  boundary: "memory",
  boundaryRationale:
    "A collision is decided from real agent directories under a project folder and a separate user home on disk; production lint observes both without mutating either.",
  derivedFrom: [],
  supersedes: [],
  assumptions: [
    "Agents resolve user-scope skill and subagent directories relative to the selected user home.",
  ],
  openQuestions: [
    "Which copy an agent loads when names collide is agent-defined and not recorded in the agent capability catalog, so the finding names no winner.",
  ],
});

const RULE_ID = "workspace/project-outputs-not-shadowed";
const skill = (name: string) => `---\nname: ${name}\ndescription: Fixture\n---\n# Skill\n`;

describe("Project outputs shadowed by user scope", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("reports a project skill whose name a user-scope skill for the same agent uses", () => {
    const project = makeLintWorkspace({
      settings: { lint: { rules: isolatedLintRules(RULE_ID, undefined) } },
      files: {
        ".claude/skills/axm/SKILL.md": skill("axm"),
        ".claude/skills/notes/SKILL.md": skill("notes"),
      },
    });
    const home = makeLintWorkspace({ files: { ".claude/skills/axm/SKILL.md": skill("axm") } });
    cleanups.push(project.cleanup, home.cleanup);
    return Effect.gen(function* () {
      const before = [project.snapshot(), home.snapshot()];
      const { document } = yield* lintProjectWithHome(project, home.root);
      expect(
        document.findings.map(({ ruleId, severity, message, location }) => ({
          ruleId,
          severity,
          message,
          file: location?.file,
        })),
      ).toEqual([
        {
          ruleId: RULE_ID,
          severity: "warning",
          message:
            "Project skill 'axm' at .claude/skills/axm has a same-named user-scope skill at ~/.claude/skills/axm for claude-code; the agent decides which one it loads.",
          file: ".claude/skills/axm",
        },
      ]);
      for (const finding of document.findings) {
        expect(finding.message).not.toMatch(/\baxm (?:setup|sync|install|uninstall|adopt)\b/);
      }
      expect([project.snapshot(), home.snapshot()]).toEqual(before);
    }).pipe(Effect.provide(lintServices(project)));
  });

  it.effect("reports nothing when the project folder is the user home, however it is named", () => {
    const project = makeLintWorkspace({
      settings: { lint: { rules: isolatedLintRules(RULE_ID, undefined) } },
      files: { ".claude/skills/axm/SKILL.md": skill("axm") },
    });
    const alias = makeLintWorkspace();
    alias.link("home", `../${project.root.split("/").pop() ?? ""}`);
    cleanups.push(project.cleanup, alias.cleanup);
    return Effect.gen(function* () {
      const same = yield* lintProject(project, { strict: true });
      expect(same.document.findings).toEqual([]);
      const linked = yield* lintProjectWithHome(project, `${alias.root}/home`, { strict: true });
      expect(linked.document.findings).toEqual([]);
    }).pipe(Effect.provide(lintServices(project)));
  });
});
