import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { makeConfigurationFixture, type ConfigurationFixture } from "../testing.js";
import { runAgentsAdd } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/agents/add/preview-is-pure",
  title: "Agent add preview describes the new membership without changing any state",
  statement:
    "When agents add runs in preview mode for a coding agent the workspace does not yet configure, it shall report the membership and realized outputs it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or any agent's outputs.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/agents/add/records-membership-and-realizes-outputs"],
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

describe("Agent add preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** A workspace with one installed skill, so adding an agent would realize outputs. */
  const workspaceWithSkill = (): ConfigurationFixture => {
    const fixture = makeConfigurationFixture({
      settings: {
        agents: ["claude-code"],
        owner: "@acme",
        skills: { "code-review": { source: "workspace", enabled: true } },
      },
      files: {
        "skills/code-review/skill.json": AUTHORED_SKILL_MANIFEST,
        "skills/code-review/src/SKILL.md": SKILL_BODY,
      },
    });
    cleanups.push(fixture.cleanup);
    return fixture;
  };

  it.effect("a previewed add of an unconfigured agent changes no protected state", () => {
    const fixture = workspaceWithSkill();
    const before = fixture.snapshot();
    return fixture
      .provide(
        Effect.gen(function* () {
          const previewed = yield* runAgentsAdd({ ids: ["opencode"], detected: false }, "preview");

          expect(previewed).toMatchObject({
            outcome: "previewed",
            resolution: {
              units: expect.arrayContaining([
                expect.objectContaining({ label: "Add opencode", state: "ready" }),
              ]),
            },
          });
          expect(fixture.snapshot()).toEqual(before);
          expect(JSON.parse(fixture.readFile("axm.json"))).toMatchObject({
            agents: ["claude-code"],
          });
          expect(fixture.exists(".opencode")).toBe(false);
          expect(fixture.interactionState().confirmApplyChangesCalls).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "a previewed add of a retired agent without its named policy reports the required override and changes nothing",
    () => {
      const fixture = workspaceWithSkill();
      const before = fixture.snapshot();
      return fixture
        .provide(
          Effect.gen(function* () {
            const previewed = yield* runAgentsAdd(
              { ids: ["gemini-cli"], detected: false },
              "preview",
            );

            expect(previewed).toMatchObject({
              outcome: "previewed",
              resolution: {
                riskConditions: [
                  expect.objectContaining({
                    level: "override-required",
                    policy: "accept-warnings",
                    requiredFlag: "--accept-warnings",
                  }),
                ],
              },
            });
            expect(fixture.snapshot()).toEqual(before);
            expect(JSON.parse(fixture.readFile("axm.json"))).toMatchObject({
              agents: ["claude-code"],
            });
            expect(fixture.interactionState().confirmApplyChangesCalls).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
