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
  isPathSafe,
} from "./path-types.js";

layer(Path.layer, { excludeTestServices: true })("path-types", (it) => {
  it.effect("brands absolute paths after resolving them", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const result = makeAbsolutePath(path, "relative-dir");

      expect(path.isAbsolute(result)).toBe(true);
      expect(result.endsWith("relative-dir")).toBe(true);
    }),
  );

  it.effect("brands non-absolute paths as relative paths", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const result = makeRelativePath(path, "nested/file.md");

      expect(Option.isSome(result)).toBe(true);
      expect(Option.getOrNull(result)).toBe(path.normalize("nested/file.md"));
    }),
  );

  it.effect("rejects absolute paths as relative paths", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const result = makeRelativePath(path, "/somewhere/file.md");

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

      expect(Option.getOrNull(result)).toBe(path.normalize("../outside/review"));
    }),
  );

  const pathSafe = (base: string, target: string) =>
    Effect.map(Path.Path, (path) => isPathSafe(path, base, target));

  it.effect("accepts a target within base", () =>
    Effect.map(pathSafe("/a/b", "/a/b/c/d"), (safe) => expect(safe).toBe(true)),
  );

  it.effect("accepts a target equal to base", () =>
    Effect.map(pathSafe("/a/b", "/a/b"), (safe) => expect(safe).toBe(true)),
  );

  it.effect("rejects a target that escapes via parent traversal", () =>
    Effect.map(pathSafe("/a/b", "/a/b/../../etc/passwd"), (safe) => expect(safe).toBe(false)),
  );

  it.effect("rejects a sibling of base", () =>
    Effect.map(pathSafe("/a/b", "/a/c"), (safe) => expect(safe).toBe(false)),
  );

  it.effect("normalizes . and .. segments before comparison", () =>
    Effect.map(pathSafe("/a/b", "/a/b/./c/../c/d"), (safe) => expect(safe).toBe(true)),
  );

  it.effect("rejects a sibling whose name extends base (boundary check)", () =>
    Effect.map(pathSafe("/a/base", "/a/base-extended/file"), (safe) => expect(safe).toBe(false)),
  );

  it.effect("accepts a deeply nested target within base", () =>
    Effect.map(pathSafe("/a", "/a/b/c/d/e/f"), (safe) => expect(safe).toBe(true)),
  );

  it.effect("rejects a target that is the parent of base", () =>
    Effect.map(pathSafe("/a/b/c", "/a/b"), (safe) => expect(safe).toBe(false)),
  );
});
