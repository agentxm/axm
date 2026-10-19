import * as NodePath from "@effect/platform-node/NodePath";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import { isLexicallyWithin, isRelativeWithin } from "./path-containment.js";

describe("lexical path containment", () => {
  it.effect("keeps children and rejects climbs on POSIX", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      expect(isLexicallyWithin(path, "/root", "/root/child")).toBe(true);
      expect(isLexicallyWithin(path, "/root", "/root/..cache")).toBe(true);
      expect(isLexicallyWithin(path, "/root", "/root/a/../b")).toBe(true);
      expect(isLexicallyWithin(path, "/root", "/rooted")).toBe(false);
      expect(isLexicallyWithin(path, "/root", "/root/../other")).toBe(false);
      expect(isLexicallyWithin(path, "/root", "/")).toBe(false);
    }).pipe(Effect.provide(NodePath.layerPosix)),
  );

  it.effect("counts the parent itself only when asked", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      expect(isLexicallyWithin(path, "/root", "/root/")).toBe(true);
      expect(isLexicallyWithin(path, "/root", "/root", { includeSelf: false })).toBe(false);
      expect(isLexicallyWithin(path, "/root", "/root/a", { includeSelf: false })).toBe(true);
    }).pipe(Effect.provide(NodePath.layerPosix)),
  );

  it.effect("classifies relative paths", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      expect(isRelativeWithin(path, "")).toBe(true);
      expect(isRelativeWithin(path, "a/b")).toBe(true);
      expect(isRelativeWithin(path, "..cache")).toBe(true);
      expect(isRelativeWithin(path, "..")).toBe(false);
      expect(isRelativeWithin(path, "../a")).toBe(false);
      expect(isRelativeWithin(path, "/a")).toBe(false);
    }).pipe(Effect.provide(NodePath.layerPosix)),
  );

  it.effect("rejects other drives on Windows", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      expect(isLexicallyWithin(path, "C:\\root", "C:\\root\\child")).toBe(true);
      expect(isLexicallyWithin(path, "C:\\root", "D:\\root\\child")).toBe(false);
      expect(isLexicallyWithin(path, "C:\\root", "C:\\rooted")).toBe(false);
    }).pipe(Effect.provide(NodePath.layerWin32)),
  );

  it.effect("compares Windows capability prefixes exactly", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      expect(isLexicallyWithin(path, "C:\\Root", "C:\\root\\child")).toBe(true);
      expect(isLexicallyWithin(path, "C:\\Root", "C:\\root\\child", { windowsPrefix: true })).toBe(
        false,
      );
      expect(isLexicallyWithin(path, "C:\\Root", "C:\\Root\\child", { windowsPrefix: true })).toBe(
        true,
      );
      expect(isLexicallyWithin(path, "C:\\", "C:\\child", { windowsPrefix: true })).toBe(true);
      expect(
        isLexicallyWithin(path, "C:\\Root", "C:\\Root", {
          includeSelf: false,
          windowsPrefix: true,
        }),
      ).toBe(false);
    }).pipe(Effect.provide(NodePath.layerWin32)),
  );
});
