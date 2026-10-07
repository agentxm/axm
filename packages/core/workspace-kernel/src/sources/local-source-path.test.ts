import * as NodePath from "@effect/platform-node/NodePath";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import { localRefSourcePath } from "./live.js";

describe("Windows local source anchoring", () => {
  it.effect.each([
    { root: "C:/workspace", selected: "C:/workspace/vendor/review", expected: "vendor/review" },
    { root: "C:/workspace", selected: "C:/outside/review", expected: "C:/outside/review" },
    {
      root: "C:/Users/runneradmin/project",
      selected: "C:/Users/RUNNER~1/project/vendor/review",
      expected: "C:/Users/RUNNER~1/project/vendor/review",
    },
    { root: "C:/workspace", selected: "D:/review", expected: "D:/review" },
    { root: "C:/workspace", selected: "C:/workspace", expected: "." },
  ])("anchors $selected from $root", ({ root, selected, expected }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const actual = localRefSourcePath(path, path.normalize(root), path.normalize(selected));
      expect(actual).toBe(expected);
    }).pipe(Effect.provide(NodePath.layerWin32)),
  );
});
