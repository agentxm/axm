import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleSetup } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/specification-metadata";
import { makeSetupSpecContext } from "../../support/setup-harness.js";

export const specification = defineSpecification({
  requirement: "cli/setup/agent-membership-is-a-set",
  title: "Setup treats coding-agent membership as a set",
  statement:
    "When setup resolves coding-agent membership, it shall offer each configurable agent exactly once however many configuration, detection, or suggestion sources name that agent, and shall record the resolved membership as a set, so overlapping evidence or a repeated request never yields a duplicated agent or an unwritable workspace.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const readSettings = (workspaceRoot: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(workspaceRoot, "axm.json"), "utf8"));

describe("Coding-agent membership", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("offers each agent once when detection and suggestion name the same agent", () =>
    Effect.gen(function* () {
      // Workstation evidence with no project evidence is the case that makes
      // the sources overlap: the agent is detected on the workstation and is
      // also named by the catalog suggestion the empty project falls back to.
      const context = makeSetupSpecContext({
        flags: { nonInteractive: false },
        interaction: { selectAgents: ["claude-code"] },
      });
      cleanups.push(context.cleanup);
      fs.mkdirSync(path.join(context.home, ".claude"), { recursive: true });

      yield* handleSetup({ scope: "project", scopeExplicit: true }).pipe(
        Effect.provide(context.layer),
      );

      const offer = context.promptState.selectAgentsCalls[0];
      // Both sources name the agent, so the offer is a real overlap.
      expect(offer?.userDetectedIds).toContain("claude-code");
      expect(offer?.suggestedIds).toContain("claude-code");
      const offered = offer?.allAgents.map((agent) => agent.id) ?? [];
      expect(offered.filter((id) => id === "claude-code")).toEqual(["claude-code"]);
      expect(offered).toHaveLength(new Set(offered).size);
    }),
  );

  it.effect("records a repeated selection once", () =>
    Effect.gen(function* () {
      const context = makeSetupSpecContext({
        flags: { nonInteractive: false },
        interaction: { selectAgents: ["claude-code", "codex", "claude-code"] },
      });
      cleanups.push(context.cleanup);

      yield* handleSetup({ scope: "project", scopeExplicit: true }).pipe(
        Effect.provide(context.layer),
      );

      expect(readSettings(context.root)).toMatchObject({ agents: ["claude-code", "codex"] });
    }),
  );

  it.effect("records a repeated request once", () =>
    Effect.gen(function* () {
      const context = makeSetupSpecContext({ machine: true });
      cleanups.push(context.cleanup);

      yield* handleSetup({
        scope: "project",
        scopeExplicit: true,
        agents: ["claude-code", "claude-code"],
        yes: true,
      }).pipe(Effect.provide(context.layer));

      expect(readSettings(context.root)).toMatchObject({ agents: ["claude-code"] });
      expect(context.rendererState.results.at(-1)?.data).toMatchObject({
        result: { status: "initialized", agents: [{ id: "claude-code", name: "Claude Code" }] },
      });
    }),
  );
});
