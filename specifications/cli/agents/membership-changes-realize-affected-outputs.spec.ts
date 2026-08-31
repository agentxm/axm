import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import * as fs from "node:fs";
import * as path from "node:path";

import {
  expectNoOpPlanResult,
  handleAgentsAdd,
  handleAgentsRemove,
  handleInstall,
} from "axm.sh/specification-harness";

import { defineSpecification } from "../../support/contract.js";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/agents/membership-changes-realize-affected-outputs",
  title: "Agent membership changes update the durable target set and its owned outputs together",
  class: "functional",
  role: "experience",
  goals: ["agent-interoperability", "workspace-intent-fidelity"],
  methods: ["example"],
});

describe("Coding-agent membership changes", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const workspaceWithInstalledSkill = (options?: Parameters<typeof makeSpecWorkspace>[0]) =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace(options);
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      yield* handleInstall({
        source: Option.some(skillPackage),
        yes: true,
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      return workspace;
    });

  const addAgent = (workspace: ReturnType<typeof makeSpecWorkspace>, agentId: string) =>
    handleAgentsAdd({
      ids: [agentId],
      detected: false,
      yes: true,
      force: false,
      preview: false,
    }).pipe(Effect.provide(workspace.layer));

  const removeAgent = (workspace: ReturnType<typeof makeSpecWorkspace>, agentId: string) =>
    handleAgentsRemove({
      ids: [agentId],
      yes: true,
      force: false,
      preview: false,
    }).pipe(Effect.provide(workspace.layer));

  it.effect(
    "adding an agent records it as a durable target and realizes installed extensions for it",
    () =>
      Effect.gen(function* () {
        const workspace = yield* workspaceWithInstalledSkill();
        expect(workspace.exists(".opencode/skills/code-review")).toBe(false);

        yield* addAgent(workspace, "opencode");

        expect(workspace.readSettings()).toMatchObject({
          agents: ["claude-code", "opencode"],
        });
        expect(workspace.snapshotTree(".opencode")).toContain(".opencode/skills/code-review");
      }),
  );

  it.effect("adding an already-configured agent changes nothing and says so", () =>
    Effect.gen(function* () {
      const workspace = yield* workspaceWithInstalledSkill({
        machine: true,
        flags: { json: true },
      });
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

  it.effect(
    "removing an agent removes it from the target set together with its managed outputs",
    () =>
      Effect.gen(function* () {
        const workspace = yield* workspaceWithInstalledSkill();
        yield* addAgent(workspace, "opencode");
        expect(workspace.exists(".opencode/skills/code-review")).toBe(true);

        yield* removeAgent(workspace, "opencode");

        expect(workspace.readSettings()).toMatchObject({ agents: ["claude-code"] });
        expect(workspace.exists(".opencode/skills/code-review")).toBe(false);
        // The remaining agent's realization is untouched by the change.
        expect(workspace.exists(".claude/skills/code-review")).toBe(true);
      }),
  );

  it.effect("removing an agent preserves native content it cannot prove it owns", () =>
    Effect.gen(function* () {
      const workspace = yield* workspaceWithInstalledSkill();
      yield* addAgent(workspace, "opencode");
      const unownedSkill = path.join(workspace.root, ".opencode", "skills", "hand-authored");
      fs.mkdirSync(unownedSkill, { recursive: true });
      fs.writeFileSync(path.join(unownedSkill, "SKILL.md"), "# Authored by hand\n");

      yield* removeAgent(workspace, "opencode");

      expect(workspace.exists(".opencode/skills/code-review")).toBe(false);
      expect(workspace.readFile(".opencode/skills/hand-authored/SKILL.md")).toBe(
        "# Authored by hand\n",
      );
    }),
  );
});
