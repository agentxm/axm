import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  decodeAbsolutePathSync,
  decodeRelativePathSync,
  makeAbsolutePath,
  makeRelativePath,
  makeWorkspaceRelativePath,
  makeWorkspaceRelativeSourcePath,
} from "./path-types.js";

layer(NodeServices.layer, { excludeTestServices: true })("path-types", (it) => {
  it.effect("brands absolute paths after resolving them", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const result = makeAbsolutePath(path, "relative-dir");

      expect(nodePath.isAbsolute(result)).toBe(true);
      expect(result.endsWith("relative-dir")).toBe(true);
    }),
  );

  it.effect("brands non-absolute paths as relative paths", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const result = makeRelativePath(path, "nested/file.md");

      expect(Option.isSome(result)).toBe(true);
      expect(Option.getOrNull(result)).toBe(nodePath.normalize("nested/file.md"));
    }),
  );

  it.effect("rejects absolute paths as relative paths", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const result = makeRelativePath(path, nodePath.join(process.cwd(), "file.md"));

      expect(Option.isNone(result)).toBe(true);
    }),
  );

  it("rejects relative paths as absolute paths", () => {
    expect(() => decodeAbsolutePathSync("nested/file.md")).toThrow();
  });

  it("rejects absolute paths at the relative schema boundary", () => {
    expect(() => decodeRelativePathSync("/tmp/file.md")).toThrow();
  });

  it("rejects escaping paths at the relative schema boundary", () => {
    expect(() => decodeRelativePathSync("../file.md")).toThrow();
  });

  it.effect("derives a workspace-relative path for absolute targets under root", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const result = makeWorkspaceRelativePath(
        path,
        decodeAbsolutePathSync("/workspace"),
        "/workspace/.claude/skills/a",
      );

      expect(Option.getOrNull(result)).toBe(".claude/skills/a");
    }),
  );

  it.effect("rejects workspace-relative paths that escape root", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const result = makeWorkspaceRelativePath(
        path,
        decodeAbsolutePathSync("/workspace"),
        "/outside/file.md",
      );

      expect(Option.isNone(result)).toBe(true);
    }),
  );

  it.effect("derives a selected local source coordinate under the workspace", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const result = makeWorkspaceRelativeSourcePath(
        path,
        decodeAbsolutePathSync("/workspace"),
        "/workspace/vendor/skills/review",
      );

      expect(Option.getOrNull(result)).toBe("vendor/skills/review");
    }),
  );

  it.effect("represents selected local sources outside the workspace with parent segments", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const result = makeWorkspaceRelativeSourcePath(
        path,
        decodeAbsolutePathSync("/workspace"),
        "/outside/review",
      );

      expect(Option.getOrNull(result)).toBe(nodePath.normalize("../outside/review"));
    }),
  );
});
