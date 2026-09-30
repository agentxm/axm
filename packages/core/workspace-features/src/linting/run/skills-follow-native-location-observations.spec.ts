import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { queryLintWorkspace } from "../index.js";
import { lintServices, projectSelection } from "../test-helpers.js";
import { isolatedLintRules, makeLintWorkspace } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/lint/skills-follow-native-location-observations",
  title: "Skill lint reports required native locations independently of membership",
  statement:
    "When lint evaluates Skill realization, it shall report missing shared-policy locations even without configured agents and missing required primary locations even when an additional read location is populated, shall accept owned physical aliases, and shall distinguish preserved foreign content from owned output that contradicts disabled intent.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity", "safe-repetition"],
  methods: ["decision-table", "example"],
  derivedFrom: ["workspace/skills/physical-locations-include-shared-policy"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Skill lint uses native ownership and location obligations", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const workspace = (agents: ReadonlyArray<string>, enabled = true) => {
    const fixture = makeLintWorkspace({
      settings: {
        owner: "@acme",
        agents,
        skills: { review: { source: "workspace", enabled } },
        lint: { rules: isolatedLintRules("workspace/skills-artifacts-correct", undefined) },
      },
      files: {
        "skills/review/skill.json": JSON.stringify({
          owner: "@acme",
          type: "skill",
          name: "review",
          version: "1.0.0",
        }),
        "skills/review/src/SKILL.md":
          "---\nname: review\ndescription: Review changes\n---\n# Review\n",
      },
    });
    cleanups.push(fixture.cleanup);
    return fixture;
  };

  it.effect("reports missing shared policy with no configured agents", () => {
    const fixture = workspace([]);
    const before = fixture.snapshot();
    return Effect.gen(function* () {
      const result = yield* queryLintWorkspace(projectSelection(fixture), { strict: false });
      expect(result.outcome).toBe("fail");
      expect(result.document.findings).toHaveLength(1);
      expect(result.document.findings[0]?.observed).toMatch(/shared Skill policy/u);
      expect(fixture.snapshot()).toEqual(before);
    }).pipe(Effect.provide(lintServices(fixture)));
  });

  it.effect("additional discovery does not hide a missing primary location", () => {
    const fixture = workspace(["cursor"]);
    fixture.link(".agents/skills/review", "skills/review/src");
    fixture.link(".claude/skills/review", "skills/review/src");
    return Effect.gen(function* () {
      const result = yield* queryLintWorkspace(projectSelection(fixture), { strict: false });
      expect(result.outcome).toBe("fail");
      expect(result.document.findings).toHaveLength(1);
      expect(result.document.findings[0]?.observed).toMatch(/missing.*cursor/u);
    }).pipe(Effect.provide(lintServices(fixture)));
  });

  it.effect("one owned entry satisfies aliased primary and shared locations", () => {
    const fixture = workspace(["claude-code"]);
    fixture.link(".agents/skills/review", "skills/review/src");
    fixture.link(".claude/skills", ".agents/skills");
    const before = fixture.snapshot();
    return Effect.gen(function* () {
      const result = yield* queryLintWorkspace(projectSelection(fixture), { strict: false });
      expect(result.document.findings).toEqual([]);
      expect(fixture.snapshot()).toEqual(before);
    }).pipe(Effect.provide(lintServices(fixture)));
  });

  for (const owned of [false, true])
    it.effect(
      `disabled intent ${owned ? "reports owned residue" : "preserves foreign contents"}`,
      () => {
        const fixture = workspace(["claude-code"], false);
        if (owned) fixture.link(".claude/skills/review", "skills/review/src");
        else fixture.writeFile(".claude/skills/review/SKILL.md", "# Foreign review\n");
        const before = fixture.snapshot();
        return Effect.gen(function* () {
          const result = yield* queryLintWorkspace(projectSelection(fixture), { strict: false });
          expect(result.document.findings).toHaveLength(owned ? 1 : 0);
          if (owned) expect(result.document.findings[0]?.observed).toMatch(/disabled.*owned/u);
          expect(fixture.snapshot()).toEqual(before);
        }).pipe(Effect.provide(lintServices(fixture)));
      },
    );
});
