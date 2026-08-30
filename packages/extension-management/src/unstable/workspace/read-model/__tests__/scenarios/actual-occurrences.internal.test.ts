/**
 * Scenario: Actual extension state is occurrence-shaped, and actual entries
 * carry stable occurrence identity and subject-specific origin.
 *
 * Spec requirement coverage:
 *
 * - Single agent-rendered skill is one actual entry.
 * - Same skill in two materialized agent dirs emits one actual entry per
 *   catalog agent that reads those dirs.
 * - Same skill across agent dirs and canonical AXM includes the canonical
 *   occurrence.
 * - Same skill across agent dirs and external AXM includes the external
 *   occurrence.
 * - Duplicate scanner observations of one physical occurrence collapse to
 *   one entry with one stable occurrence identity (the live composition
 *   exposes only one scanner per origin per scope, so this is verified
 *   indirectly by checking the canonical/agent split keeps unique
 *   identities even on same-name materializations).
 * - Distinct physical paths under the same name produce different
 *   identities.
 *
 * Identity check: each `ActualSkill` carries an `origin` discriminator and a
 * `contentRoot` string. Two entries with the same `(scope, type, origin,
 * contentRoot)` triple share identity; differing in any field gives distinct
 * identities. For agent-dir occurrences, `origin` includes the `agentId` so
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { AGENTS } from "../../../../agents/registry.js";
import type { AgentId } from "@agentxm/extension-model/unstable/agents/types";
import type { FixtureSpec } from "../../__fixtures__/builder.js";
import { runScenario, SCENARIO_USER_HOME, SCENARIO_WORKSPACE_ROOT } from "./_harness.js";
import type { ActualSkill } from "../../extensions/skill.js";

// ---------------------------------------------------------------------------
// Identity-tuple helper
// ---------------------------------------------------------------------------

const identityKey = (s: ActualSkill): string => {
  const originKey =
    s.origin._tag === "agent-skill-dir" ? `agent-skill-dir:${s.origin.agentId}` : s.origin._tag;
  return `${s.key.scope}\u0000${s.key.type}\u0000${originKey}\u0000${s.contentRoot}`;
};

// ---------------------------------------------------------------------------
// Spec helpers
// ---------------------------------------------------------------------------

const spec = (project: NonNullable<FixtureSpec["project"]>): FixtureSpec => ({
  workspaceRoot: SCENARIO_WORKSPACE_ROOT,
  userHome: SCENARIO_USER_HOME,
  project,
});

const runActual = (s: FixtureSpec) => runScenario(s, (ctx) => ctx.scope("project").skills.actual);

const expectedSkillAgentIdsFor = (agentIds: ReadonlyArray<AgentId>): ReadonlyArray<string> => {
  const observedDirs = agentIds.flatMap((agentId) => {
    const skills = AGENTS[agentId].skills;
    return skills === undefined ? [] : [skills.dir];
  });
  return observedDirs
    .flatMap((observedDir) =>
      Object.values(AGENTS).flatMap((agent) => {
        const skills = agent.skills;
        return skills !== undefined &&
          [skills.dir, ...skills.additionalReadPaths.map(({ path }) => path)].includes(observedDir)
          ? [agent.id]
          : [];
      }),
    )
    .sort();
};

describe("actual-occurrence shape", () => {
  it.effect("single agent-rendered skill produces exactly one actual entry", () =>
    Effect.gen(function* () {
      const actuals = yield* runActual(
        spec({
          agentDirs: {
            "claude-code": {
              "skills/some-skill/SKILL.md": "# some-skill\n",
            },
          },
        }),
      );
      const matching = actuals.filter((a) => a.key.name === "some-skill");
      expect(matching).toHaveLength(expectedSkillAgentIdsFor(["claude-code"]).length);
      expect(matching).toContainEqual(
        expect.objectContaining({ origin: { _tag: "agent-skill-dir", agentId: "claude-code" } }),
      );
    }),
  );

  it.effect("same skill in two agent dirs produces two distinct actual entries", () =>
    Effect.gen(function* () {
      const actuals = yield* runActual(
        spec({
          agentDirs: {
            "claude-code": {
              "skills/some-skill/SKILL.md": "# claude\n",
            },
            codex: {
              "skills/some-skill/SKILL.md": "# codex\n",
            },
          },
        }),
      );
      const matches = actuals.filter((a) => a.key.name === "some-skill");
      const expectedAgentIds = expectedSkillAgentIdsFor(["claude-code", "codex"]);
      expect(matches).toHaveLength(expectedAgentIds.length);
      const agentIds = matches
        .flatMap((a) => (a.origin._tag === "agent-skill-dir" ? [a.origin.agentId] : []))
        .map((id) => String(id))
        .sort();
      expect(agentIds).toEqual(expectedAgentIds);
      // Distinct identities.
      expect(new Set(matches.map(identityKey)).size).toBe(expectedAgentIds.length);
    }),
  );

  it.effect("same skill in two agent dirs + canonical AXM is three actual entries", () =>
    Effect.gen(function* () {
      const actuals = yield* runActual(
        spec({
          agentDirs: {
            "claude-code": {
              "skills/some-skill/SKILL.md": "# claude\n",
            },
            codex: {
              "skills/some-skill/SKILL.md": "# codex\n",
            },
          },
          axmExtensions: {
            "agentxm/@owner/skills/some-skill/skill.json": JSON.stringify({
              owner: "@owner",
              type: "skill",
              name: "some-skill",
              version: "1.0.0",
            }),
            "agentxm/@owner/skills/some-skill/src/SKILL.md": "# canonical\n",
          },
        }),
      );
      const matches = actuals.filter((a) => a.key.name === "some-skill");
      const expectedAgentIds = expectedSkillAgentIdsFor(["claude-code", "codex"]);
      expect(matches).toHaveLength(expectedAgentIds.length + 1);
      const originTags = matches.map((a) => a.origin._tag).sort();
      expect(originTags.filter((tag) => tag === "agent-skill-dir")).toHaveLength(
        expectedAgentIds.length,
      );
      expect(originTags).toContain("canonical-axm-skill");
      const agentIds = matches
        .flatMap((a) => (a.origin._tag === "agent-skill-dir" ? [a.origin.agentId] : []))
        .map((id) => String(id))
        .sort();
      expect(agentIds).toEqual(expectedAgentIds);
      expect(new Set(matches.map(identityKey)).size).toBe(expectedAgentIds.length + 1);
    }),
  );

  it.effect("same skill in two agent dirs + external AXM is three actual entries", () =>
    Effect.gen(function* () {
      const actuals = yield* runActual(
        spec({
          agentDirs: {
            "claude-code": {
              "skills/some-skill/SKILL.md": "# claude\n",
            },
            codex: {
              "skills/some-skill/SKILL.md": "# codex\n",
            },
          },
          axmExtensions: {
            "github/owner/repo/.agents/skills/some-skill/SKILL.md":
              "---\nname: some-skill\ndescription: External skill\n---\n# external\n",
          },
        }),
      );
      const matches = actuals.filter((a) => a.key.name === "some-skill");
      const expectedAgentIds = expectedSkillAgentIdsFor(["claude-code", "codex"]);
      expect(matches).toHaveLength(expectedAgentIds.length + 1);
      const originTags = matches.map((a) => a.origin._tag).sort();
      expect(originTags.filter((tag) => tag === "agent-skill-dir")).toHaveLength(
        expectedAgentIds.length,
      );
      expect(originTags).toContain("external-axm-skill");
      expect(new Set(matches.map(identityKey)).size).toBe(expectedAgentIds.length + 1);
    }),
  );
});

describe("occurrence identity", () => {
  it.effect("duplicate scanner observations of one physical occurrence collapse to one entry", () =>
    Effect.gen(function* () {
      // A physical path is attributed once to each catalog agent that reads
      // it. Re-yield the cell to confirm the cached effect does not duplicate
      // that stable attribution set on re-read.
      const actualsFirst = yield* runScenario(
        spec({
          agentDirs: {
            "claude-code": {
              "skills/some-skill/SKILL.md": "# claude\n",
            },
          },
        }),
        (ctx) =>
          Effect.gen(function* () {
            const a1 = yield* ctx.scope("project").skills.actual;
            const a2 = yield* ctx.scope("project").skills.actual;
            return { a1, a2 };
          }),
      );
      const expectedCount = expectedSkillAgentIdsFor(["claude-code"]).length;
      expect(actualsFirst.a1).toHaveLength(expectedCount);
      expect(actualsFirst.a2).toHaveLength(expectedCount);
      expect(actualsFirst.a1.map(identityKey)).toEqual(actualsFirst.a2.map(identityKey));
    }),
  );

  it.effect("distinct physical paths under one name have different occurrence identities", () =>
    Effect.gen(function* () {
      const actuals = yield* runActual(
        spec({
          agentDirs: {
            "claude-code": {
              "skills/some-skill/SKILL.md": "# claude\n",
            },
            codex: {
              "skills/some-skill/SKILL.md": "# codex\n",
            },
          },
        }),
      );
      const matches = actuals.filter((a) => a.key.name === "some-skill");
      const identities = new Set(matches.map(identityKey));
      expect(identities.size).toBe(expectedSkillAgentIdsFor(["claude-code", "codex"]).length);
    }),
  );
});
