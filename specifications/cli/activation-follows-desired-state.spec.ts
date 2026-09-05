import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  handleDisableMcpServer,
  handleEnableMcpServer,
  handleInstall,
  handleMcpsAdd,
  handleSkillsDisable,
  handleSkillsEnable,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/activation-follows-desired-state",
  title: "Activation commands change realized surfaces without touching content or resolutions",
  statement:
    "When an installed extension is disabled or enabled, the workspace shall record the new activation intent and change only that extension's realized agent surfaces, and shall not alter canonical content or accepted resolutions.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "agent-interoperability"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Activation follows desired state", () => {
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
      const packageRoot = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      yield* handleInstall({
        source: Option.some(packageRoot),
        yes: true,
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      return workspace;
    });

  it.effect(
    "disabling a skill suspends its agent surfaces and preserves canonical content and the accepted resolution",
    () =>
      Effect.gen(function* () {
        const workspace = yield* workspaceWithInstalledSkill();
        const canonicalBefore = workspace.snapshotTree("agent_extensions");
        const lockBefore = workspace.readLockfileText();

        yield* handleSkillsDisable({ name: "code-review", yes: true, preview: false }).pipe(
          Effect.provide(workspace.layer),
        );

        expect(workspace.exists(".claude/skills/code-review")).toBe(false);
        expect(workspace.exists(".agents/skills/code-review")).toBe(false);
        expect(workspace.snapshotTree("agent_extensions")).toEqual(canonicalBefore);
        expect(workspace.readLockfileText()).toBe(lockBefore);
        expect(workspace.readSettings()).toMatchObject({
          skills: { "code-review": { enabled: false } },
        });
      }),
  );

  it.effect("enabling the skill restores its agent surfaces exactly", () =>
    Effect.gen(function* () {
      const workspace = yield* workspaceWithInstalledSkill();
      const claudeBefore = workspace.snapshotTree(".claude");
      const agentsBefore = workspace.snapshotTree(".agents");
      const lockBefore = workspace.readLockfileText();

      yield* handleSkillsDisable({ name: "code-review", yes: true, preview: false }).pipe(
        Effect.provide(workspace.layer),
      );
      yield* handleSkillsEnable({ name: "code-review", yes: true, preview: false }).pipe(
        Effect.provide(workspace.layer),
      );

      expect(workspace.snapshotTree(".claude")).toEqual(claudeBefore);
      expect(workspace.snapshotTree(".agents")).toEqual(agentsBefore);
      expect(workspace.readLockfileText()).toBe(lockBefore);
      expect(workspace.readSettings()).toMatchObject({
        skills: { "code-review": expect.anything() },
      });
      expect(workspace.readSettings()).not.toMatchObject({
        skills: { "code-review": { enabled: false } },
      });
    }),
  );

  it.effect("disabling and enabling an inline MCP server changes only its agent projection", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace();
      cleanups.push(workspace.cleanup);
      yield* handleMcpsAdd({
        name: "context",
        command: Option.some("npx context-server"),
        url: Option.none(),
        env: [],
        header: [],
        yes: true,
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      expect(workspace.readFile(".mcp.json")).toContain('"context"');
      const lockBefore = workspace.readLockfileText();
      expect(lockBefore).not.toContain("context");

      yield* handleDisableMcpServer({ name: "context", yes: true, preview: false }).pipe(
        Effect.provide(workspace.layer),
      );
      expect(workspace.readFile(".mcp.json")).not.toContain('"context"');
      expect(workspace.readSettings()).toMatchObject({
        mcpServers: { context: { command: "npx", enabled: false } },
      });
      expect(workspace.readLockfileText()).toBe(lockBefore);

      yield* handleEnableMcpServer({ name: "context", yes: true, preview: false }).pipe(
        Effect.provide(workspace.layer),
      );
      expect(workspace.readFile(".mcp.json")).toContain('"context"');
      expect(workspace.readSettings()).toMatchObject({
        mcpServers: { context: { command: "npx" } },
      });
      expect(workspace.readLockfileText()).toBe(lockBefore);
    }),
  );
});
