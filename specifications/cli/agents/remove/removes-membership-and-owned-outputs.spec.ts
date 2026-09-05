import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleAgentsAdd, handleAgentsRemove, handleInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/agents/remove/removes-membership-and-owned-outputs",
  title: "Removing a coding agent retires it together with the outputs only it reached",
  statement:
    "When a coding agent is removed from the workspace, AXM shall remove it from the durable agent set and remove the owned outputs no remaining configured agent reaches in one operation, and shall leave every remaining agent's realization untouched.",
  class: "functional",
  role: "experience",
  goals: ["agent-interoperability", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/agents/membership-changes-realize-affected-outputs"],
  supersedes: ["cli/agents/membership-changes-realize-affected-outputs"],
  assumptions: [],
  openQuestions: [],
});

describe("Removing a coding agent", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const workspaceWithAgents = (agentId: string) =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace();
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      yield* handleInstall({
        source: Option.some(skillPackage),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      yield* handleAgentsAdd({
        ids: [agentId],
        detected: false,
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      return workspace;
    });

  const removeAgent = (workspace: ReturnType<typeof makeSpecWorkspace>, agentId: string) =>
    handleAgentsRemove({
      ids: [agentId],
      force: false,
      preview: false,
    }).pipe(Effect.provide(workspace.layer));

  it.effect(
    "removing an agent removes it from the target set together with its managed outputs",
    () =>
      Effect.gen(function* () {
        const workspace = yield* workspaceWithAgents("opencode");
        expect(workspace.exists(".opencode/skills/code-review")).toBe(true);

        yield* removeAgent(workspace, "opencode");

        expect(workspace.readSettings()).toMatchObject({ agents: ["claude-code"] });
        expect(workspace.exists(".opencode/skills/code-review")).toBe(false);
        // The remaining agent's realization is untouched by the change.
        expect(workspace.exists(".claude/skills/code-review")).toBe(true);
      }),
  );

  it.effect("removing one claimant preserves an owned projection in a shared agent directory", () =>
    Effect.gen(function* () {
      const workspace = yield* workspaceWithAgents("amp");
      expect(workspace.exists(".agents/skills/code-review")).toBe(true);

      yield* removeAgent(workspace, "amp");

      expect(workspace.exists(".agents/skills/code-review")).toBe(true);
      expect(workspace.readSettings()).toMatchObject({ agents: ["claude-code"] });
    }),
  );
});
