import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import { readWorkspacePackageDirectories } from "./workspace-packages.js";
import { readProductionPackages } from "./production-packages.js";

const makeWorkspace = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-inventory-" });
  const files = {
    "pnpm-workspace.yaml": "packages:\n  - packages/*\n  - apps/cli\n  - missing/*\n",
    "packages/model/project.json": JSON.stringify({ tags: ["role:contract"] }),
    "packages/model/package.json": JSON.stringify({ name: "@test/model" }),
    "packages/client/project.json": JSON.stringify({ tags: ["role:capability"] }),
    "packages/client/package.json": JSON.stringify({
      name: "@test/client",
      dependencies: { "@test/model": "workspace:*", external: "1" },
      peerDependencies: { "@test/model": "workspace:*" },
    }),
    "packages/tool/project.json": JSON.stringify({ tags: ["role:tooling"] }),
    "packages/tool/package.json": JSON.stringify({ name: "@test/tool" }),
    "packages/no-project/package.json": JSON.stringify({ name: "@test/no-project" }),
    "packages/.hidden/package.json": "{}",
    "packages/node_modules/package.json": "{}",
    "apps/cli/project.json": JSON.stringify({ tags: ["role:application"] }),
    "apps/cli/package.json": JSON.stringify({
      name: "test-cli",
      optionalDependencies: { "@test/client": "workspace:*" },
    }),
  };
  for (const [file, contents] of Object.entries(files)) {
    const destination = path.join(root, file);
    yield* fs.makeDirectory(path.dirname(destination), { recursive: true });
    yield* fs.writeFileString(destination, contents);
  }
  yield* fs.makeDirectory(path.join(root, "packages/empty"));
  yield* fs.symlink(path.join(root, "packages/model"), path.join(root, "packages/linked"));
  return { fs, path, root };
});

describe("workspace and production inventory", () => {
  it.effect("retains literal and wildcard traversal, ordering, and symlink exclusions", () =>
    Effect.gen(function* () {
      const { root } = yield* makeWorkspace;
      expect(yield* readWorkspacePackageDirectories(root)).toEqual([
        "apps/cli",
        "packages/client",
        "packages/model",
        "packages/no-project",
        "packages/tool",
      ]);
      expect(yield* readProductionPackages(root)).toEqual([
        {
          name: "test-cli",
          directory: "apps/cli",
          levels: ["application"],
          dependencies: ["@test/client"],
        },
        {
          name: "@test/client",
          directory: "packages/client",
          levels: ["capability"],
          dependencies: ["@test/model", "@test/model"],
        },
        {
          name: "@test/model",
          directory: "packages/model",
          levels: ["contract"],
          dependencies: [],
        },
      ]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("preserves directory and descriptor permission failures", () =>
    Effect.gen(function* () {
      const { root, fs, path } = yield* makeWorkspace;
      const deniedDirectory = PlatformError.systemError({
        _tag: "PermissionDenied",
        module: "FileSystem",
        method: "readDirectoryEntries",
        pathOrDescriptor: path.join(root, "packages"),
      });
      const directoryFs = FileSystem.make({
        ...fs,
        readDirectoryEntries: (directory) =>
          directory === path.join(root, "packages")
            ? Effect.fail(deniedDirectory)
            : fs.readDirectoryEntries(directory),
      });
      expect(
        yield* Effect.flip(
          readWorkspacePackageDirectories(root).pipe(
            Effect.provideService(FileSystem.FileSystem, directoryFs),
          ),
        ),
      ).toBe(deniedDirectory);
      const deniedProject = PlatformError.systemError({
        _tag: "PermissionDenied",
        module: "FileSystem",
        method: "readFileString",
        pathOrDescriptor: path.join(root, "packages/model/project.json"),
      });
      const projectFs: FileSystem.FileSystem = {
        ...fs,
        readFileString: (file, encoding) =>
          file === path.join(root, "packages/model/project.json")
            ? Effect.fail(deniedProject)
            : fs.readFileString(file, encoding),
      };
      expect(
        yield* Effect.flip(
          readProductionPackages(root).pipe(
            Effect.provideService(FileSystem.FileSystem, projectFs),
          ),
        ),
      ).toBe(deniedProject);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("keeps invalid workspace and manifest data in the typed failure channel", () =>
    Effect.gen(function* () {
      const { root, fs, path } = yield* makeWorkspace;
      yield* fs.writeFileString(path.join(root, "packages/model/package.json"), "[]");
      expect(yield* Effect.flip(readProductionPackages(root))).toMatchObject({
        _tag: "SchemaError",
      });
      yield* fs.writeFileString(path.join(root, "pnpm-workspace.yaml"), "packages: []\n");
      expect(yield* Effect.flip(readWorkspacePackageDirectories(root))).toMatchObject({
        _tag: "SchemaError",
      });
      yield* fs.writeFileString(
        path.join(root, "pnpm-workspace.yaml"),
        "packages: [packages/**]\n",
      );
      expect(yield* Effect.flip(readWorkspacePackageDirectories(root))).toMatchObject({
        _tag: "ReleaseValidationFailed",
      });
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
