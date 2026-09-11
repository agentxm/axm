import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { SettingsSchema } from "@agentxm/workspace-state";

import {
  makeAgentMembershipFixture,
  type AgentMembershipFixture,
} from "../../test-support/agent-membership-fixture.js";
import { handleAgentsAdd } from "./add.js";

export const specification = defineSpecification({
  requirement: "cli/agents/add/records-membership-and-realizes-outputs",
  title: "Adding a coding agent records it durably and realizes installed extensions for it",
  statement:
    "When a coding agent is added to the workspace, AXM shall record it in the configured agent set and realize installed extensions on its supported native and shared surfaces as permitted by workspace activation and instruction settings in one operation.",
  class: "functional",
  role: "experience",
  goals: ["agent-interoperability", "workspace-intent-fidelity"],
  boundary: "memory",
  boundaryRationale:
    "Recording membership belongs to the configuration feature and realizing installed extensions to the reconciliation feature, so the application layer that composes both is the lowest layer at which one operation does both; the workspace it writes is a real directory.",
  methods: ["example"],
  derivedFrom: ["cli/agents/membership-changes-realize-affected-outputs"],
  supersedes: ["cli/agents/membership-changes-realize-affected-outputs"],
  assumptions: [],
  openQuestions: [],
});

const skillBody = (name: string): string =>
  `---\nname: ${name}\ndescription: The ${name} skill.\n---\n\n# ${name}\n`;

const skillManifest = (name: string): string =>
  `${JSON.stringify(
    { owner: "@acme", type: "skill", name, version: "1.0.0", description: `The ${name} skill.` },
    null,
    2,
  )}\n`;

const authoredSkill = (name: string): Readonly<Record<string, string>> => ({
  [`skills/${name}/skill.json`]: skillManifest(name),
  [`skills/${name}/src/SKILL.md`]: skillBody(name),
});

/**
 * Declarations as the settings contract models them. The document's authored
 * spelling is not the rule's subject: a shorthand and a longhand declaration
 * of the same activation are the same declaration.
 */
const declarations = (fixture: AgentMembershipFixture) =>
  Schema.decodeUnknownSync(SettingsSchema)(fixture.readSettings()).skills;

const addAgent = (fixture: AgentMembershipFixture, id: string) =>
  fixture.provide(handleAgentsAdd({ ids: [id], detected: false, force: false, preview: false }));

describe("Adding a coding agent", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** A workspace with one enabled Skill realized for its one configured agent. */
  const workspaceWithInstalledSkill = (
    extra: {
      readonly settings?: Readonly<Record<string, unknown>>;
      readonly files?: Readonly<Record<string, string>>;
    } = {},
  ): AgentMembershipFixture => {
    const fixture = makeAgentMembershipFixture({
      machine: true,
      settings: {
        agents: ["claude-code"],
        owner: "@acme",
        skills: { "code-review": { source: "workspace", enabled: true } },
        ...extra.settings,
      },
      files: { ...authoredSkill("code-review"), ...extra.files },
    });
    cleanups.push(fixture.cleanup);
    fixture.link(".claude/skills/code-review", "skills/code-review/src");
    fixture.link(".agents/skills/code-review", "skills/code-review/src");
    return fixture;
  };

  it.effect(
    "adding an agent records it as a durable target and realizes installed extensions for it",
    () => {
      const fixture = workspaceWithInstalledSkill();
      expect(fixture.exists(".opencode/skills/code-review")).toBe(false);

      return Effect.gen(function* () {
        yield* addAgent(fixture, "opencode");

        expect(fixture.readSettings()).toMatchObject({ agents: ["claude-code", "opencode"] });
        expect(fixture.readFile(".opencode/skills/code-review/SKILL.md")).toBe(
          fixture.readFile("skills/code-review/src/SKILL.md"),
        );
      });
    },
  );

  it.effect(
    "realizes enabled Skills while preserving a disabled Skill and existing agent output",
    () => {
      const fixture = workspaceWithInstalledSkill({
        settings: {
          skills: {
            "code-review": { source: "workspace", enabled: true },
            "disabled-review": { source: "workspace", enabled: false },
          },
        },
        files: authoredSkill("disabled-review"),
      });
      const declarationsBefore = declarations(fixture);
      const authoredBefore = fixture.snapshotOf("skills");
      const oldAgentBefore = fixture.snapshotOf(".claude");
      const lockBefore = fixture.readLockfileText();
      const instructions = fixture.readFile("skills/code-review/src/SKILL.md");
      expect(fixture.exists(".opencode/skills/code-review")).toBe(false);
      expect(fixture.exists(".claude/skills/disabled-review")).toBe(false);

      return Effect.gen(function* () {
        yield* addAgent(fixture, "opencode");

        expect(fixture.rendererState.results.at(-1)).toMatchObject({
          ok: true,
          data: { result: { outcome: "applied", counts: { failed: 0, blocked: 0 } } },
        });
        expect(fixture.readSettings()["agents"]).toEqual(["claude-code", "opencode"]);
        expect(declarations(fixture)).toEqual(declarationsBefore);
        expect(fixture.readFile(".opencode/skills/code-review/SKILL.md")).toBe(instructions);
        expect(fixture.exists(".opencode/skills/disabled-review")).toBe(false);
        expect(fixture.exists(".agents/skills/disabled-review")).toBe(false);
        expect(fixture.snapshotOf("skills")).toEqual(authoredBefore);
        expect(fixture.snapshotOf(".claude")).toEqual(oldAgentBefore);
        expect(fixture.readLockfileText()).toBe(lockBefore);
      });
    },
  );

  it.effect(
    "adds a Skill-capable agent without inventing an unsupported native Hook representation",
    () => {
      // The workspace also declares a Hook, whose only native representation
      // is the configured agent's own settings file. The agent being added
      // supports Skills, not Hooks.
      const fixture = workspaceWithInstalledSkill({
        settings: { hooks: { "review-guard": { source: "workspace", enabled: true } } },
        files: {
          "hooks/review-guard/hook.json": `${JSON.stringify(
            {
              $schema: "https://axm.sh/schemas/hook.schema.json",
              owner: "@acme",
              type: "hook",
              name: "review-guard",
              version: "1.0.0",
              description: "The review-guard hook.",
              runtime: "bash",
              entrypoint: "src/hook.sh",
              bindings: [{ on: "tool.pre", match: { tools: ["file.write"] } }],
            },
            null,
            2,
          )}\n`,
          "hooks/review-guard/src/hook.sh": '#!/usr/bin/env bash\necho "review-guard"\n',
          ".opencode/keep.txt": "Existing native agent content.\n",
        },
      });
      const hookBefore = fixture.exists(".claude/settings.json")
        ? fixture.readFile(".claude/settings.json")
        : null;
      const authoredBefore = fixture.snapshotOf("skills");
      const lockBefore = fixture.readLockfileText();
      const nativeBefore = fixture
        .snapshotOf(".opencode")
        .filter(([relative]) => relative !== "skills" && !relative.startsWith("skills/"));

      return Effect.gen(function* () {
        yield* addAgent(fixture, "opencode");

        expect(fixture.rendererState.results.at(-1)).toMatchObject({
          ok: true,
          data: { result: { outcome: "applied", counts: { failed: 0, blocked: 0 } } },
        });
        expect(fixture.readSettings()["agents"]).toEqual(["claude-code", "opencode"]);
        expect(fixture.readFile(".opencode/skills/code-review/SKILL.md")).toBe(
          fixture.readFile("skills/code-review/src/SKILL.md"),
        );
        // The new agent's directory gained Skills and nothing else: no hook
        // representation was invented for a surface it does not declare.
        expect(
          fixture
            .snapshotOf(".opencode")
            .filter(([relative]) => relative !== "skills" && !relative.startsWith("skills/")),
        ).toEqual(nativeBefore);
        expect(fixture.exists(".opencode/settings.json")).toBe(false);
        expect(
          fixture.exists(".claude/settings.json")
            ? fixture.readFile(".claude/settings.json")
            : null,
        ).toBe(hookBefore);
        expect(fixture.snapshotOf("skills")).toEqual(authoredBefore);
        expect(fixture.readLockfileText()).toBe(lockBefore);
      });
    },
  );
});
