import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { queryLintWorkspace } from "../../index.js";
import { lintServices, projectSelection } from "../../test-helpers.js";
import { makeLintWorkspace, isolatedLintRules } from "../../testing.js";

export const specification = defineSpecification({
  requirement: "cli/lint/authored-skills-are-not-agent-output",
  title: "Authored skills are excluded from unowned agent output findings",
  statement:
    "When a declared workspace skill has a valid manifest matching its declared identity at its authored package path, lint shall exclude that package from unowned agent output findings regardless of activation or configured agents, while continuing to report unowned native content and undeclared or invalid package lookalikes.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  boundary: "memory",
  boundaryRationale:
    "A real workspace holds the source package and overlapping native agent directory; production lint observes its ownership and normal/strict outcomes without mutating it.",
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const manifest = (name: string, owner = "@acme") =>
  JSON.stringify({
    owner,
    type: "skill",
    name,
    version: "1.0.0",
    description: "Fixture skill",
  });
const skill = (name: string) => `---\nname: ${name}\ndescription: Fixture skill\n---\n# Skill\n`;

const rules = isolatedLintRules("workspace/managed-file-unowned", undefined);

describe("Authored source ownership", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect.each([
    { enabled: false, agents: ["claude-code"], directory: "skills" },
    { enabled: true, agents: ["claude-code"], directory: "skills" },
    { enabled: false, agents: ["openclaw"], directory: "skills" },
    { enabled: true, agents: [], directory: "authored/skills" },
  ])("excludes declared source with $enabled activation in $directory for $agents", (testCase) => {
    const workspace = makeLintWorkspace({
      settings: {
        owner: "@acme",
        agents: testCase.agents,
        skillsConfig: { dir: testCase.directory },
        skills: { review: { source: "workspace", enabled: testCase.enabled } },
        lint: { rules },
      },
      files: {
        [`${testCase.directory}/review/skill.json`]: manifest("review"),
        [`${testCase.directory}/review/src/SKILL.md`]: skill("review"),
      },
    });
    cleanups.push(workspace.cleanup);
    return Effect.gen(function* () {
      const before = workspace.snapshot();
      for (const strict of [false, true]) {
        const result = yield* queryLintWorkspace(projectSelection(workspace), { strict });
        expect(result.outcome).toBe("success");
        expect(result.document.findings).toEqual([]);
      }
      expect(workspace.snapshot()).toEqual(before);
    }).pipe(Effect.provide(lintServices(workspace)));
  });

  it.effect(
    "retains findings for native content, undeclared packages, invalid identities, and malformed manifests",
    () => {
      const workspace = makeLintWorkspace({
        settings: {
          owner: "@acme",
          agents: [],
          skills: { wrong: "workspace", malformed: "workspace", valid: "workspace" },
          lint: { rules },
        },
        files: {
          "skills/valid/skill.json": manifest("valid"),
          "skills/valid/src/SKILL.md": skill("valid"),
          "skills/wrong/skill.json": manifest("wrong", "@other"),
          "skills/wrong/src/SKILL.md": skill("wrong"),
          "skills/malformed/skill.json": "{broken",
          "skills/malformed/src/SKILL.md": skill("malformed"),
          "skills/undeclared/skill.json": manifest("undeclared"),
          "skills/undeclared/src/SKILL.md": skill("undeclared"),
          "skills/native/SKILL.md": skill("native"),
          "foreign/SKILL.md": skill("foreign"),
        },
      });
      cleanups.push(workspace.cleanup);
      workspace.link(".claude/skills/foreign", "foreign");
      return Effect.gen(function* () {
        const before = workspace.snapshot();
        const result = yield* queryLintWorkspace(projectSelection(workspace), { strict: true });
        expect(result.outcome).toBe("fail");
        expect(result.document.findings.map((finding) => finding.location?.file).sort()).toEqual([
          ".claude/skills/foreign",
          "skills/malformed",
          "skills/native",
          "skills/undeclared",
          "skills/wrong",
        ]);
        expect(workspace.snapshot()).toEqual(before);
      }).pipe(Effect.provide(lintServices(workspace)));
    },
  );
});
