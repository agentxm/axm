import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { expectNoOpPlanResult, handleAgentsAdd, handleInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../../support/install-harness.js";

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

describe("Repeat agent additions are safe", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const addAgent = (workspace: ReturnType<typeof makeSpecWorkspace>, agentId: string) =>
    handleAgentsAdd({
      ids: [agentId],
      detected: false,
      force: false,
      preview: false,
    }).pipe(Effect.provide(workspace.layer));

  it.effect("adding an already-configured agent changes nothing and says so", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      yield* handleInstall({
        source: Option.some(skillPackage),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      yield* addAgent(workspace, "opencode");
      const settingsBefore = JSON.stringify(workspace.readSettings());
      const treeBefore = workspace.snapshotTree(".opencode");

      yield* addAgent(workspace, "opencode");

      const lastResult = workspace.rendererState.results.at(-1);
      expectNoOpPlanResult(lastResult?.data, {
        planName: "Add coding agents",
        message: "All requested agents are already configured",
      });
      expect(JSON.stringify(workspace.readSettings())).toBe(settingsBefore);
      expect(workspace.snapshotTree(".opencode")).toEqual(treeBefore);
    }),
  );
});
