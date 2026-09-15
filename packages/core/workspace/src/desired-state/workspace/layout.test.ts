import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { resolveProjectWorkspaceLayout, resolveUserWorkspaceLayout } from "./layout.js";

const projectRoot = decodeAbsolutePathSync("/tmp/axm-project");

describe("WorkspaceLayout", () => {
  it.effect("resolves the project contract and conventional authored roots", () =>
    Effect.gen(function* () {
      const layout = yield* resolveProjectWorkspaceLayout(projectRoot, {});

      expect(layout.settingsPath).toBe(path.join(projectRoot, "axm.json"));
      expect(layout.lockPath).toBe(path.join(projectRoot, "axm-lock.yaml"));
      expect(layout.runtimeDir).toBe(path.join(projectRoot, ".axm"));
      expect(layout.acquiredRoot).toBe(path.join(projectRoot, "agent_extensions"));
      expect(layout.authoredRoot("skill")).toBe(path.join(projectRoot, "skills"));
      expect(layout.authoredRoot("mcp-server")).toBe(path.join(projectRoot, "mcps"));
      expect(layout.authoredRoot("pack")).toBe(path.join(projectRoot, "packs"));
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("resolves one configured authored root per type", () =>
    Effect.gen(function* () {
      const layout = yield* resolveProjectWorkspaceLayout(projectRoot, {
        skillsConfig: { dir: "extensions/skills" },
        knowledgeConfig: { dir: "extensions/knowledge", instructions: false },
      });

      expect(layout.authoredRoot("skill")).toBe(path.join(projectRoot, "extensions", "skills"));
      expect(layout.authoredRoot("knowledge")).toBe(
        path.join(projectRoot, "extensions", "knowledge"),
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("resolves the user workspace beneath the AXM application home", () =>
    Effect.gen(function* () {
      const layout = yield* resolveUserWorkspaceLayout(decodeAbsolutePathSync("/tmp/user"));

      expect(layout.axmHome).toBe("/tmp/user/.axm");
      expect(layout.workspaceRoot).toBe("/tmp/user/.axm/workspace");
      expect(layout.settingsPath).toBe("/tmp/user/.axm/workspace/axm.json");
      expect(layout.lockPath).toBe("/tmp/user/.axm/workspace/axm-lock.yaml");
      expect(layout.runtimeDir).toBe("/tmp/user/.axm/workspace/.axm");
      expect(layout.acquiredRoot).toBe("/tmp/user/.axm/workspace/agent_extensions");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects escaping, reserved, overlapping, and agent projection roots", () =>
    Effect.gen(function* () {
      const cases = [
        { skillsConfig: { dir: "../skills" } },
        { skillsConfig: { dir: ".axm/skills" } },
        { skillsConfig: { dir: "agent_extensions/skills" } },
        { skillsConfig: { dir: ".claude/skills" } },
        { skillsConfig: { dir: "extensions" }, rulesConfig: { dir: "extensions/rules" } },
      ];

      for (const settings of cases) {
        const result = yield* Effect.result(resolveProjectWorkspaceLayout(projectRoot, settings));
        expect(Result.isFailure(result)).toBe(true);
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
