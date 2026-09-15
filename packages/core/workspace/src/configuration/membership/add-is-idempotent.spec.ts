import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { makeConfigurationFixture } from "../testing.js";
import { runAgentsAdd } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/agents/add/add-is-idempotent",
  title: "Adding an already configured coding agent is a successful no-op",
  statement:
    "When a coding agent the workspace already configures is added again, AXM shall report a no-op outcome and shall not change the agent set or that agent's realized outputs.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition"],
  methods: ["example"],
  derivedFrom: ["cli/agents/membership-changes-realize-affected-outputs"],
  supersedes: ["cli/agents/membership-changes-realize-affected-outputs"],
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

describe("Repeat agent additions are safe", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("adding an already-configured agent changes nothing and says so", () => {
    // A workspace that already configures the agent and already carries the
    // outputs realized for it: the rule is about what a repeat does, not about
    // how the first addition realized them.
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
    const settingsBefore = fixture.readFile("axm.json");
    const treeBefore = fixture.snapshot();

    return fixture
      .provide(
        Effect.gen(function* () {
          const repeated = yield* runAgentsAdd({ ids: ["opencode"], detected: false }, "apply");

          expect(repeated).toMatchObject({
            _tag: "Unchanged",
            reason: "already-configured",
            message: "All requested agents are already configured",
          });
          expect(fixture.readFile("axm.json")).toBe(settingsBefore);
          expect(fixture.snapshot()).toEqual(treeBefore);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
