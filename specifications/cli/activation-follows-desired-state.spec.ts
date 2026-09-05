import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as fs from "node:fs";
import * as path from "node:path";
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
import { snapshotWorkspaceContent } from "../support/workspace-fixtures.js";

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

        yield* handleSkillsDisable({ name: "code-review", preview: false }).pipe(
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
      const claudeBefore = snapshotWorkspaceContent(path.join(workspace.root, ".claude"));
      const agentsBefore = snapshotWorkspaceContent(path.join(workspace.root, ".agents"));
      const sourceBefore = workspace.readFile(".claude/skills/code-review/SKILL.md");
      const canonicalBefore = snapshotWorkspaceContent(
        path.join(workspace.root, "agent_extensions"),
      );
      const lockBefore = workspace.readLockfileText();

      yield* handleSkillsDisable({ name: "code-review", preview: false }).pipe(
        Effect.provide(workspace.layer),
      );
      yield* handleSkillsEnable({ name: "code-review", preview: false }).pipe(
        Effect.provide(workspace.layer),
      );

      expect(workspace.readFile(".claude/skills/code-review/SKILL.md")).toBe(sourceBefore);
      expect(workspace.readFile(".agents/skills/code-review/SKILL.md")).toBe(sourceBefore);
      expect(snapshotWorkspaceContent(path.join(workspace.root, ".claude"))).toEqual(claudeBefore);
      expect(snapshotWorkspaceContent(path.join(workspace.root, ".agents"))).toEqual(agentsBefore);
      expect(snapshotWorkspaceContent(path.join(workspace.root, "agent_extensions"))).toEqual(
        canonicalBefore,
      );
      expect(workspace.readLockfileText()).toBe(lockBefore);
      expect(workspace.readSettings()).toMatchObject({
        skills: { "code-review": expect.anything() },
      });
      expect(workspace.readSettings()).not.toMatchObject({
        skills: { "code-review": { enabled: false } },
      });
    }),
  );

  for (const format of ["agent-skill", "workspace"] as const)
    it.effect(`restores the ${format} Skill entry document without changing its content`, () =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({ machine: true });
        cleanups.push(workspace.cleanup);
        const name = "format-review";
        const source = writeLocalSkillPackage(workspace.root, { name });
        const instructions = fs.readFileSync(path.join(source, "src", "SKILL.md"), "utf8");
        if (format === "agent-skill") {
          fs.writeFileSync(path.join(source, "SKILL.md"), instructions);
          fs.rmSync(path.join(source, "skill.json"));
          fs.rmSync(path.join(source, "src"), { recursive: true });
          yield* handleInstall({ source: Option.some(source), force: false, preview: false }).pipe(
            Effect.provide(workspace.layer),
          );
          yield* handleSkillsDisable({ name, preview: false }).pipe(
            Effect.provide(workspace.layer),
          );
        } else {
          const authored = path.join(workspace.root, "skills", name);
          fs.mkdirSync(path.dirname(authored), { recursive: true });
          fs.renameSync(source, authored);
          workspace.writeSettings({
            owner: "@acme",
            agents: ["claude-code"],
            skills: { [name]: { source: "workspace", enabled: false } },
          });
        }
        const contentRoot = path.join(
          workspace.root,
          format === "workspace" ? "skills" : "agent_extensions",
        );
        const contentBefore = snapshotWorkspaceContent(contentRoot);
        const lockBefore = workspace.readLockfileText();
        yield* handleSkillsEnable({ name, preview: false }).pipe(Effect.provide(workspace.layer));
        expect(workspace.readFile(`.claude/skills/${name}/SKILL.md`)).toBe(instructions);
        expect(workspace.readFile(`.agents/skills/${name}/SKILL.md`)).toBe(instructions);
        expect(snapshotWorkspaceContent(contentRoot)).toEqual(contentBefore);
        expect(workspace.readLockfileText()).toBe(lockBefore);
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
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      expect(workspace.readFile(".mcp.json")).toContain('"context"');
      const lockBefore = workspace.readLockfileText();
      expect(lockBefore).not.toContain("context");

      yield* handleDisableMcpServer({ name: "context", preview: false }).pipe(
        Effect.provide(workspace.layer),
      );
      expect(workspace.readFile(".mcp.json")).not.toContain('"context"');
      expect(workspace.readSettings()).toMatchObject({
        mcpServers: { context: { command: "npx", enabled: false } },
      });
      expect(workspace.readLockfileText()).toBe(lockBefore);

      yield* handleEnableMcpServer({ name: "context", preview: false }).pipe(
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
