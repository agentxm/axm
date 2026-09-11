import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { makeAgentMembershipFixture } from "../../test-support/agent-membership-fixture.js";
import { handleAgentsRemove } from "./remove.js";

export const specification = defineSpecification({
  requirement: "cli/agents/remove/preserves-unowned-agent-content",
  title: "Removing a coding agent never removes agent-native content without AXM ownership proof",
  statement:
    "When a coding agent is removed from the workspace, AXM shall remove only agent-native content it can prove it owns and shall leave hand-authored content in the same agent directory untouched.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "agent-interoperability"],
  boundary: "memory",
  boundaryRationale:
    "Ownership is proven by what a real agent directory entry is — a link into a canonical root, or a hand-authored file that is neither — so the evidence is the directory itself before and after the removal.",
  methods: ["example"],
  derivedFrom: ["cli/agents/membership-changes-realize-affected-outputs"],
  supersedes: ["cli/agents/membership-changes-realize-affected-outputs"],
  assumptions: [],
  openQuestions: [],
});

const SKILL_BODY =
  "---\nname: code-review\ndescription: The code-review skill.\n---\n\n# code-review\n";
const AUTHORED_BY_HAND = "# Authored by hand\n";

describe("Removing a coding agent preserves unowned content", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("removing an agent preserves native content it cannot prove it owns", () => {
    const fixture = makeAgentMembershipFixture({
      settings: {
        agents: ["claude-code", "opencode"],
        owner: "@acme",
        skills: { "code-review": { source: "workspace", enabled: true } },
      },
      files: {
        "skills/code-review/skill.json": `${JSON.stringify(
          {
            owner: "@acme",
            type: "skill",
            name: "code-review",
            version: "1.0.0",
            description: "The code-review skill.",
          },
          null,
          2,
        )}\n`,
        "skills/code-review/src/SKILL.md": SKILL_BODY,
        // Hand-authored, in the same agent directory AXM writes into, with no
        // ownership proof of any kind.
        ".opencode/skills/hand-authored/SKILL.md": AUTHORED_BY_HAND,
      },
    });
    cleanups.push(fixture.cleanup);
    fixture.link(".claude/skills/code-review", "skills/code-review/src");
    fixture.link(".agents/skills/code-review", "skills/code-review/src");
    fixture.link(".opencode/skills/code-review", "skills/code-review/src");

    return Effect.gen(function* () {
      yield* fixture.provide(
        handleAgentsRemove({ ids: ["opencode"], force: false, preview: false }),
      );

      expect(fixture.exists(".opencode/skills/code-review")).toBe(false);
      expect(fixture.readFile(".opencode/skills/hand-authored/SKILL.md")).toBe(AUTHORED_BY_HAND);
    });
  });
});
