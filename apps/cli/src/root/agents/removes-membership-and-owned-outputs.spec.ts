import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  makeAgentMembershipFixture,
  type AgentMembershipFixture,
} from "../../test-support/agent-membership-fixture.js";
import { handleAgentsRemove } from "./remove.js";

export const specification = defineSpecification({
  requirement: "cli/agents/remove/removes-membership-and-owned-outputs",
  title: "Removing a coding agent retires it together with the outputs only it reached",
  statement:
    "When a coding agent is removed from the workspace, AXM shall remove it from the durable agent set and remove the owned outputs no remaining configured agent reaches in one operation, and shall leave every remaining agent's realization untouched.",
  class: "functional",
  role: "experience",
  goals: ["agent-interoperability", "workspace-intent-fidelity"],
  boundary: "memory",
  boundaryRationale:
    "Retiring membership belongs to the configuration feature and cleaning up the departing agent's outputs to the reconciliation feature, so the application layer that composes both is the lowest layer at which one operation does both; the outputs it removes are entries in a real directory.",
  methods: ["example"],
  derivedFrom: ["cli/agents/membership-changes-realize-affected-outputs"],
  supersedes: ["cli/agents/membership-changes-realize-affected-outputs"],
  assumptions: [
    "Claude Code declares its own project skills directory while Amp declares the shared `.agents/skills` directory, so one workspace can hold both a single-claimant and a shared agent surface.",
  ],
  openQuestions: [],
});

const SKILL = "code-review";
const SKILL_BODY = `---\nname: ${SKILL}\ndescription: The ${SKILL} skill.\n---\n\n# ${SKILL}\n`;
const SKILL_MANIFEST = `${JSON.stringify(
  {
    owner: "@acme",
    type: "skill",
    name: SKILL,
    version: "1.0.0",
    description: `The ${SKILL} skill.`,
  },
  null,
  2,
)}\n`;

describe("Removing a coding agent", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** A workspace with one enabled Skill realized for both configured agents. */
  const workspaceWithAgents = (second: string, secondSkillsDir: string): AgentMembershipFixture => {
    const fixture = makeAgentMembershipFixture({
      settings: {
        agents: ["claude-code", second],
        owner: "@acme",
        skills: { [SKILL]: { source: "workspace", enabled: true } },
      },
      files: {
        [`skills/${SKILL}/skill.json`]: SKILL_MANIFEST,
        [`skills/${SKILL}/src/SKILL.md`]: SKILL_BODY,
      },
    });
    cleanups.push(fixture.cleanup);
    // Claude Code's own directory and the shared one the workspace already
    // realizes into; the second agent adds a directory only when it declares
    // one of its own.
    for (const directory of new Set([".claude/skills", ".agents/skills", secondSkillsDir])) {
      fixture.link(`${directory}/${SKILL}`, `skills/${SKILL}/src`);
    }
    return fixture;
  };

  const removeAgent = (fixture: AgentMembershipFixture, id: string) =>
    fixture.provide(handleAgentsRemove({ ids: [id], force: false, preview: false }));

  it.effect(
    "removing an agent removes it from the target set together with its managed outputs",
    () => {
      const fixture = workspaceWithAgents("opencode", ".opencode/skills");
      expect(fixture.exists(`.opencode/skills/${SKILL}`)).toBe(true);

      return Effect.gen(function* () {
        yield* removeAgent(fixture, "opencode");

        expect(fixture.readSettings()).toMatchObject({ agents: ["claude-code"] });
        expect(fixture.exists(`.opencode/skills/${SKILL}`)).toBe(false);
        // The remaining agent's realization is untouched by the change.
        expect(fixture.exists(`.claude/skills/${SKILL}`)).toBe(true);
      });
    },
  );

  it.effect(
    "removing one claimant preserves an owned projection in a shared agent directory",
    () => {
      // Amp reads the shared `.agents/skills` directory, which the workspace
      // still requires for its remaining agents.
      const fixture = workspaceWithAgents("amp", ".agents/skills");
      expect(fixture.exists(`.agents/skills/${SKILL}`)).toBe(true);

      return Effect.gen(function* () {
        yield* removeAgent(fixture, "amp");

        expect(fixture.exists(`.agents/skills/${SKILL}`)).toBe(true);
        expect(fixture.readSettings()).toMatchObject({ agents: ["claude-code"] });
      });
    },
  );
});
