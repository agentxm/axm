/**
 * Unit tests for the VFT-backed `SkillFileAccessor`.
 *
 * Covers bounds enforcement:
 *
 * - Reads rooted at the accessor root (no leaking the full tree).
 * - `..` segments rejected in both `exists` and `readBytes`.
 * - Absolute paths (posix and Windows drive letters) rejected.
 * - Missing files return `false` from `exists` and a `read-error` from
 *   `readBytes`.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { makeVftSkillFileAccessor, type VFTNode } from "./vft.js";

const makeTree = (files: Readonly<Record<string, string>>): VFTNode => {
  const map = new Map<string, Uint8Array>();
  const encoder = new TextEncoder();
  for (const [key, value] of Object.entries(files)) {
    map.set(key, encoder.encode(value));
  }
  return {
    hasFile: (p) => map.has(p),
    getFile: (p) => map.get(p),
  };
};

describe("makeVftSkillFileAccessor", () => {
  it.effect("exists returns true for a rooted file", () =>
    Effect.gen(function* () {
      const accessor = makeVftSkillFileAccessor(makeTree({ "SKILL.md": "content" }));
      expect(yield* accessor.exists("SKILL.md")).toBe(true);
    }),
  );

  it.effect("exists returns false for a missing file", () =>
    Effect.gen(function* () {
      const accessor = makeVftSkillFileAccessor(makeTree({}));
      expect(yield* accessor.exists("SKILL.md")).toBe(false);
    }),
  );

  it.effect("exists returns false for a `..` escape attempt", () =>
    Effect.gen(function* () {
      const accessor = makeVftSkillFileAccessor(makeTree({ "SKILL.md": "x" }));
      expect(yield* accessor.exists("../SKILL.md")).toBe(false);
      expect(yield* accessor.exists("nested/../../SKILL.md")).toBe(false);
    }),
  );

  it.effect("exists returns false for an absolute path", () =>
    Effect.gen(function* () {
      const accessor = makeVftSkillFileAccessor(makeTree({ "SKILL.md": "x" }));
      expect(yield* accessor.exists("/SKILL.md")).toBe(false);
      expect(yield* accessor.exists("C:/SKILL.md")).toBe(false);
    }),
  );

  it.effect("readBytes returns bytes for a rooted file", () =>
    Effect.gen(function* () {
      const accessor = makeVftSkillFileAccessor(makeTree({ "SKILL.md": "content" }));
      const bytes = yield* accessor.readBytes("SKILL.md");
      expect(new TextDecoder().decode(bytes)).toBe("content");
    }),
  );

  it.effect("readBytes fails with read-error for missing files", () =>
    Effect.gen(function* () {
      const accessor = makeVftSkillFileAccessor(makeTree({}));
      const exit = yield* Effect.exit(accessor.readBytes("SKILL.md"));
      if (exit._tag !== "Failure") {
        throw new Error("expected failure");
      }
      expect(exit.cause).toBeDefined();
    }),
  );

  it.effect("readBytes fails with path-escape for `..` segments", () =>
    Effect.gen(function* () {
      const accessor = makeVftSkillFileAccessor(makeTree({ "SKILL.md": "x" }));
      const result = yield* accessor.readBytes("../etc/passwd").pipe(Effect.flip);
      expect(result.reason).toBe("path-escape");
    }),
  );

  it.effect("readBytes fails with path-escape for absolute paths", () =>
    Effect.gen(function* () {
      const accessor = makeVftSkillFileAccessor(makeTree({ "SKILL.md": "x" }));
      const posix = yield* accessor.readBytes("/etc/passwd").pipe(Effect.flip);
      expect(posix.reason).toBe("path-escape");
      const win = yield* accessor.readBytes("C:/Windows/foo").pipe(Effect.flip);
      expect(win.reason).toBe("path-escape");
    }),
  );

  it.effect("normalizes `./` prefix when reading", () =>
    Effect.gen(function* () {
      const accessor = makeVftSkillFileAccessor(makeTree({ "SKILL.md": "x" }));
      const bytes = yield* accessor.readBytes("./SKILL.md");
      expect(new TextDecoder().decode(bytes)).toBe("x");
    }),
  );
});
