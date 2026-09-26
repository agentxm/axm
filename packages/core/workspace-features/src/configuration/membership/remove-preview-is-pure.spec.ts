import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { makeConfigurationFixture, type ConfigurationFixture } from "../testing.js";
import { runAgentsRemove } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/agents/remove/preview-is-pure",
  title: "Agent remove preview describes the departure without changing any state",
  statement:
    "When agents remove runs in preview mode for a configured coding agent, it shall report the membership and owned outputs it would remove with a previewed outcome and shall not change settings, the lockfile, canonical content, or any agent's outputs.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/agents/remove/removes-membership-and-owned-outputs"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const SKILL_BODY = "---\nname: code-review\ndescription: Review guidance\n---\n# Review\n";

const AUTHORED_SKILL_MANIFEST = JSON.stringify(
  {
    owner: "@acme",
    type: "skill",
    name: "code-review",
    version: "1.2.3",
    description: "Review guidance",
  },
  null,
  2,
);

describe("Agent remove preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** A workspace with one installed skill realized for a second configured agent. */
  const workspaceWithSecondAgent = (): ConfigurationFixture => {
    const fixture = makeConfigurationFixture({
      settings: {
        agents: ["claude-code", "opencode"],
        owner: "@acme",
        skills: { "code-review": { source: "workspace", enabled: true } },
      },
      files: {
        "skills/code-review/skill.json": AUTHORED_SKILL_MANIFEST,
        "skills/code-review/src/SKILL.md": SKILL_BODY,
        ".opencode/skills/code-review/SKILL.md": SKILL_BODY,
      },
    });
    cleanups.push(fixture.cleanup);
    return fixture;
  };

  it.effect("a previewed remove of a configured agent changes no protected state", () => {
    const fixture = workspaceWithSecondAgent();
    const before = fixture.snapshot();
    return fixture
      .provide(
        Effect.gen(function* () {
          const previewed = yield* runAgentsRemove({ ids: ["opencode"] }, "preview");

          expect(previewed).toMatchObject({
            outcome: "previewed",
            resolution: {
              units: expect.arrayContaining([
                expect.objectContaining({ label: "Remove opencode", state: "ready" }),
              ]),
            },
          });
          expect(fixture.snapshot()).toEqual(before);
          expect(JSON.parse(fixture.readFile("axm.json"))).toMatchObject({
            agents: ["claude-code", "opencode"],
          });
          expect(fixture.exists(".opencode/skills/code-review")).toBe(true);
          expect(fixture.interactionState().confirmApplyChangesCalls).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "a previewed remove of an agent that is not configured reports a no-op and changes nothing",
    () => {
      const fixture = workspaceWithSecondAgent();
      const before = fixture.snapshot();
      return fixture
        .provide(
          Effect.gen(function* () {
            const previewed = yield* runAgentsRemove({ ids: ["cursor"] }, "preview");

            expect(previewed).toMatchObject({
              _tag: "Unchanged",
              reason: "already-absent",
              message: "All requested agents are already absent",
            });
            expect(fixture.snapshot()).toEqual(before);
            expect(fixture.interactionState().confirmApplyChangesCalls).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
