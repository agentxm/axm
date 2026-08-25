import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { decodeAbsolutePathSync } from "../utils/path-types.js";
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

  it.effect("preserves the existing user-scope state layout", () =>
    Effect.gen(function* () {
      const layout = yield* resolveUserWorkspaceLayout(
        decodeAbsolutePathSync(path.join(os.homedir(), ".axm")),
      );

      expect(layout.settingsPath).toBe(path.join(os.homedir(), ".axm", "settings.json"));
      expect(layout.lockPath).toBe(path.join(os.homedir(), ".axm", "axm-lock.yaml"));
      expect(layout.runtimeDir).toBe(path.join(os.homedir(), ".axm"));
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
