import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { lintProjectWithHome, lintServices } from "../../test-helpers.js";
import { isolatedLintRules, makeLintWorkspace } from "../../testing.js";

export const specification = defineSpecification({
  requirement: "cli/lint/reports-broken-native-output-links",
  title: "Broken native links are counted by physical entry without shadow warnings",
  statement:
    "Lint shall report each dangling native skill or subagent link once with its path and target, exclude it from same-name collisions, and distinguish failed observations from missing targets without modifying links or targets.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Production lint observes real temporary project and user directories containing dangling links and a loop.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const RULE = "workspace/native-output-links-resolve";
describe("broken native outputs", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  it.effect("reports two missing links and one loop without collision warnings or writes", () => {
    const project = makeLintWorkspace({
      settings: {
        agents: ["claude-code", "codex", "opencode"],
        lint: {
          rules: {
            ...isolatedLintRules(RULE, undefined),
            "workspace/native-outputs-readable": "warn",
            "workspace/project-outputs-not-shadowed": "warn",
          },
        },
      },
      files: {
        ".claude/skills/axm/SKILL.md": "# skill",
        ".agents/skills/axm/SKILL.md": "# skill",
        ".opencode/skills/axm/SKILL.md": "# skill",
      },
    });
    const home = makeLintWorkspace();
    home.link(".claude/skills/axm", "missing");
    home.link(".agents/skills/axm", "missing");
    home.link(".claude/agents/loop.md", ".claude/agents/loop.md");
    cleanups.push(project.cleanup, home.cleanup);
    return Effect.gen(function* () {
      const before = [project.snapshot(), home.snapshot()];
      const { document } = yield* lintProjectWithHome(project, home.root);
      const broken = document.findings.filter((finding) => finding.ruleId === RULE);
      expect(broken).toHaveLength(2);
      expect(broken.every((finding) => finding.message.includes("../../missing"))).toBe(true);
      expect(
        document.findings.filter(
          (finding) => finding.ruleId === "workspace/native-outputs-readable",
        ),
      ).toHaveLength(1);
      expect(
        document.findings.filter(
          (finding) => finding.ruleId === "workspace/project-outputs-not-shadowed",
        ),
      ).toEqual([]);
      expect([project.snapshot(), home.snapshot()]).toEqual(before);
    }).pipe(Effect.provide(lintServices(project)));
  });
});
