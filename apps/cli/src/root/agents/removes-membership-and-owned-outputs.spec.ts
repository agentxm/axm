import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import {
  makeAgentMembershipFixture,
  type AgentMembershipFixture,
} from "../../test-support/agent-membership-fixture.js";
import { handleAgentsAdd } from "./add.js";
import { WorkspaceRecords } from "@agentxm/workspace-kernel/workspace-state";
import { handleAgentsRemove } from "./remove.js";

export const specification = defineSpecification({
  requirement: "cli/agents/remove/removes-membership-and-owned-outputs",
  title: "Removing a coding agent retires it together with the outputs only it reached",
  statement:
    "When a coding agent is removed from the workspace, AXM shall remove it from the durable agent set and remove the owned outputs no remaining configured agent reaches in one operation, shall leave every remaining agent's realization untouched, and shall report retained physical units with the remaining readers or shared policy that requires them. AXM shall refuse and restore the membership change when readback finds an owned output that should have been retired still present or a retained required unit that no longer matches desired content.",
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
    "refuses membership removal when a native retirement reports success without removing its file",
    () => {
      const nativePath = ".opencode/agents/planner.md";
      const content =
        "<!-- axm:file v=1 ext=@acme/subagents/planner src=subagents/planner/src/planner.md -->\n---\nname: planner\ndescription: Plans work\n---\nPlan carefully\n";
      let retirementAttempted = false;
      const fixture = makeAgentMembershipFixture({
        machine: true,
        settings: {
          owner: "@acme",
          agents: ["claude-code", "opencode"],
          subagents: { planner: { source: "workspace", enabled: true } },
        },
        files: {
          "subagents/planner/subagent.json": JSON.stringify({
            owner: "@acme",
            type: "subagent",
            name: "planner",
            version: "1.0.0",
            description: "Plans work",
          }),
          "subagents/planner/src/planner.md":
            "---\nname: planner\ndescription: Plans work\n---\nPlan carefully\n",
          [nativePath]: content,
          ".claude/agents/planner.md": content,
        },
        fileSystemLayer: Layer.effect(
          FileSystem.FileSystem,
          Effect.map(FileSystem.FileSystem, (fs) =>
            FileSystem.make({
              ...fs,
              remove: (path, options) =>
                path.endsWith(`/${nativePath}`)
                  ? Effect.sync(() => {
                      retirementAttempted = true;
                    })
                  : fs.remove(path, options),
            }),
          ),
        ),
      });
      cleanups.push(fixture.cleanup);
      const settingsBefore = fixture.readFile("axm.json");
      return Effect.gen(function* () {
        yield* removeAgent(fixture, "opencode");
        expect(retirementAttempted).toBe(true);
        expect(fixture.readFile("axm.json")).toBe(settingsBefore);
        expect(fixture.readFile(nativePath)).toBe(content);
        expect(fixture.readFile(".claude/agents/planner.md")).toBe(content);
        expect(fixture.rendererState.results.at(-1)).not.toMatchObject({
          data: { outcome: "applied" },
        });
      });
    },
  );

  it.effect.each(["body", "ownership marker"] as const)(
    "restores membership when a retained native Subagent %s changes before final validation",
    (change) => {
      const retainedPath = ".claude/agents/planner.md";
      let foreign = "";
      let changed = false;
      let armed = false;
      const fixture = makeAgentMembershipFixture({
        machine: true,
        settings: {
          owner: "@acme",
          agents: [],
          subagents: { planner: { source: "workspace", enabled: true } },
        },
        files: {
          "subagents/planner/subagent.json": JSON.stringify({
            owner: "@acme",
            type: "subagent",
            name: "planner",
            version: "1.0.0",
            description: "Plans work",
          }),
          "subagents/planner/src/planner.md":
            "---\nname: planner\ndescription: Plans work\n---\nPlan carefully\n",
        },
        fileSystemLayer: Layer.effect(
          FileSystem.FileSystem,
          Effect.map(FileSystem.FileSystem, (fs) =>
            FileSystem.make({
              ...fs,
              rename: (source, target) =>
                fs.rename(source, target).pipe(
                  Effect.andThen(
                    Effect.suspend(() => {
                      if (!armed || changed || !target.endsWith("/axm.json")) return Effect.void;
                      changed = true;
                      return fs.writeFileString(
                        target.slice(0, -"axm.json".length) + retainedPath,
                        foreign,
                      );
                    }),
                  ),
                ),
            }),
          ),
        ),
      });
      cleanups.push(fixture.cleanup);
      return Effect.gen(function* () {
        yield* fixture.provide(
          handleAgentsAdd({
            ids: ["claude-code", "opencode"],
            detected: false,
            force: false,
            preview: false,
          }),
        );
        const inventory = yield* fixture.provide(
          Effect.flatMap(WorkspaceRecords, (records) =>
            records.getExtensionInventory("subagent", {}),
          ),
        );
        expect(
          inventory.items
            .find((item) => item.name === "planner")
            ?.agentOutcomes.every((outcome) => outcome.outcome === "current"),
        ).toBe(true);
        const settingsBefore = fixture.readFile("axm.json");
        const departingBefore = fixture.readFile(".opencode/agents/planner.md");
        const retainedBefore = fixture.readFile(retainedPath);
        foreign =
          change === "body"
            ? retainedBefore.replace("Plan carefully", "Foreign instructions")
            : retainedBefore.replace(/<!-- axm:file[\s\S]*?-->/g, "");
        expect(foreign).not.toBe(retainedBefore);
        armed = true;
        yield* removeAgent(fixture, "opencode");
        expect(changed).toBe(true);
        expect(fixture.readFile("axm.json")).toBe(settingsBefore);
        expect(fixture.readFile(retainedPath)).toBe(foreign);
        expect(fixture.readFile(".opencode/agents/planner.md")).toBe(departingBefore);
        expect(fixture.rendererState.results.at(-1)).not.toMatchObject({
          data: { outcome: "applied" },
        });
      });
    },
  );

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
    "reports retention when the remaining agent reads the departing agent's location",
    () => {
      const fixture = workspaceWithAgents("cursor", ".cursor/skills");
      return Effect.gen(function* () {
        yield* removeAgent(fixture, "claude-code");
        expect(fixture.exists(`.claude/skills/${SKILL}`)).toBe(true);
        expect(fixture.exists(`.agents/skills/${SKILL}`)).toBe(true);
        expect(fixture.readSettings()).toMatchObject({ agents: ["cursor"] });
        expect(JSON.stringify(fixture.rendererState.results.at(-1))).toContain(
          '"state":"retained"',
        );
        expect(JSON.stringify(fixture.rendererState.results.at(-1))).toContain(
          '"configuredConsumers":["cursor"]',
        );
        expect(JSON.stringify(fixture.rendererState.results.at(-1))).toContain(
          "Still required by configured consumers",
        );
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
