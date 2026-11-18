import * as path from "node:path";
import { makeRecordingFileSystem } from "@agentxm/test-support";
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

const realTempProject = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return decodeAbsolutePathSync(yield* fs.realPath(yield* fs.makeTempDirectoryScoped()));
});

const recordedLayout = (
  root: string,
  settings: Parameters<typeof resolveProjectWorkspaceLayout>[1] = {},
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { fileSystem, recording } = makeRecordingFileSystem(fs);
    const result = yield* resolveProjectWorkspaceLayout(
      decodeAbsolutePathSync(root),
      settings,
    ).pipe(Effect.provideService(FileSystem.FileSystem, fileSystem), Effect.result);
    return { result, recording };
  });

describe("WorkspaceLayout authored-root containment", () => {
  it.effect("resolves the project root's real path once for every existing authored root", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* realTempProject;
      const roots = ["skills", "mcps", "packs"].map((name) => path.join(root, name));
      for (const authored of roots) yield* fs.makeDirectory(authored);

      const { result, recording } = yield* recordedLayout(root);

      expect(Result.isSuccess(result)).toBe(true);
      expect(recording.calls({ method: "realPath", path: root })).toHaveLength(1);
      for (const authored of roots) {
        expect(recording.counts(authored)).toEqual({
          access: 1,
          lstat: 1,
          realPath: 1,
          readDirectory: 1,
        });
      }
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("resolves no real path when no authored root exists or the first one is refused", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* realTempProject;

      const empty = yield* recordedLayout(root);
      expect(Result.isSuccess(empty.result)).toBe(true);
      expect(empty.recording.calls({ method: "realPath" })).toEqual([]);

      yield* fs.writeFileString(path.join(root, "skills"), "not a directory");
      yield* fs.makeDirectory(path.join(root, "mcps"));
      const refused = yield* recordedLayout(root);
      expect(Result.isFailure(refused.result) && refused.result.failure.detail).toBe(
        `Invalid skill authored root ${path.join(root, "skills")}: expected a directory`,
      );
      expect(refused.recording.calls({ method: "realPath" })).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses a later authored root whose real path leaves the project", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* realTempProject;
      const outside = yield* realTempProject;
      yield* fs.makeDirectory(path.join(root, "skills"));
      yield* fs.makeDirectory(path.join(outside, "mcps"));
      yield* fs.symlink(outside, path.join(root, "outer"));
      const mcps = path.join(root, "outer", "mcps");

      for (const settings of [
        { mcpServersConfig: { dir: "outer/mcps" } },
        { skillsConfig: { dir: "outer/mcps" }, mcpServersConfig: { dir: "absent" } },
      ]) {
        const failure = yield* resolveProjectWorkspaceLayout(root, settings).pipe(Effect.flip);
        expect(failure.detail).toContain(`authored root ${mcps}: real path escapes the workspace`);
      }
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("accepts in-project roots of a project reached through a symbolic link", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const real = yield* realTempProject;
      const holder = yield* realTempProject;
      const linked = decodeAbsolutePathSync(path.join(holder, "project"));
      yield* fs.symlink(real, linked);
      yield* fs.makeDirectory(path.join(real, "skills"));
      yield* fs.makeDirectory(path.join(real, "packs"));

      const layout = yield* resolveProjectWorkspaceLayout(linked, {});
      expect(layout.authoredRoot("pack")).toBe(path.join(linked, "packs"));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("falls back to the resolved project path when its real path cannot be read", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* realTempProject;
      yield* fs.makeDirectory(path.join(root, "skills"));
      yield* fs.makeDirectory(path.join(root, "packs"));
      const failure = PlatformError.systemError({
        _tag: "PermissionDenied",
        module: "FileSystem",
        method: "realPath",
        pathOrDescriptor: root,
      });

      const layout = yield* resolveProjectWorkspaceLayout(root, {}).pipe(
        Effect.provideService(FileSystem.FileSystem, {
          ...fs,
          realPath: (entry) => (entry === root ? Effect.fail(failure) : fs.realPath(entry)),
        }),
      );
      expect(layout.authoredRoot("skill")).toBe(path.join(root, "skills"));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
