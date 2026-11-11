import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { resolveProjectWorkspaceLayout, resolveUserWorkspaceLayout } from "./layout.js";

const projectRoot = decodeAbsolutePathSync("/tmp/axm-project");

describe("WorkspaceLayout", () => {
  it.effect(
    "rejects symbolic-link roots and direct packages, including dangling package links",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = decodeAbsolutePathSync(yield* fs.makeTempDirectoryScoped());
        const skills = path.join(root, "skills");
        yield* fs.makeDirectory(path.join(root, "target"));
        yield* fs.symlink("target", skills);
        const rootFailure = yield* resolveProjectWorkspaceLayout(root, {}).pipe(Effect.flip);
        expect(rootFailure.detail).toContain("authored roots cannot be symlinks");
        yield* fs.remove(skills);
        yield* fs.makeDirectory(skills);
        yield* fs.symlink("absent", path.join(skills, "linked"));
        const packageFailure = yield* resolveProjectWorkspaceLayout(root, {}).pipe(Effect.flip);
        expect(packageFailure.detail).toContain("direct package directories cannot be symlinks");
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  for (const boundary of ["root", "package"] as const) {
    it.effect(`preserves a failed authored ${boundary} classification`, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = decodeAbsolutePathSync(yield* fs.makeTempDirectoryScoped());
        const skills = path.join(root, "skills");
        const packageRoot = path.join(skills, "example");
        yield* fs.makeDirectory(packageRoot, { recursive: true });
        const target = boundary === "root" ? skills : packageRoot;
        const failure = PlatformError.systemError({
          _tag: "PermissionDenied",
          module: "FileSystem",
          method: "lstat",
          pathOrDescriptor: target,
        });
        const observed = yield* resolveProjectWorkspaceLayout(root, {}).pipe(
          Effect.provideService(FileSystem.FileSystem, {
            ...fs,
            lstat: (entry) => (entry === target ? Effect.fail(failure) : fs.lstat(entry)),
          }),
          Effect.flip,
        );
        expect(observed).toMatchObject({ _tag: "WorkspaceLayoutError", cause: failure });
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }

  it.effect("resolves the project contract and conventional authored roots", () =>
    Effect.gen(function* () {
      const layout = yield* resolveProjectWorkspaceLayout(projectRoot, {});

      expect(layout.settingsPath).toBe(path.join(projectRoot, "axm.json"));
      expect(layout.lockPath).toBe(path.join(projectRoot, "axm.lock"));
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
      expect(layout.lockPath).toBe("/tmp/user/.axm/workspace/axm.lock");
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
