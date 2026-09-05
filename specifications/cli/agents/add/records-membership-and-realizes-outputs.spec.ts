import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleAgentsAdd, handleInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/agents/add/records-membership-and-realizes-outputs",
  title: "Adding a coding agent records it durably and realizes installed extensions for it",
  statement:
    "When a coding agent is added to the workspace, AXM shall record it in the durable agent set and realize every installed extension for that agent's native surfaces in one operation.",
  class: "functional",
  role: "experience",
  goals: ["agent-interoperability", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/agents/membership-changes-realize-affected-outputs"],
  supersedes: ["cli/agents/membership-changes-realize-affected-outputs"],
  assumptions: [],
  openQuestions: [],
});

describe("Adding a coding agent", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const workspaceWithInstalledSkill = () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace();
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      yield* handleInstall({
        source: Option.some(skillPackage),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      return workspace;
    });

  it.effect(
    "adding an agent records it as a durable target and realizes installed extensions for it",
    () =>
      Effect.gen(function* () {
        const workspace = yield* workspaceWithInstalledSkill();
        expect(workspace.exists(".opencode/skills/code-review")).toBe(false);

        yield* handleAgentsAdd({
          ids: ["opencode"],
          detected: false,
          force: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer));

        expect(workspace.readSettings()).toMatchObject({
          agents: ["claude-code", "opencode"],
        });
        expect(workspace.snapshotTree(".opencode")).toContain(".opencode/skills/code-review");
      }),
  );
});
