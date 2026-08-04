/**
 * Publish ignore resolution.
 *
 * The feature is opt-in, so the interesting cases are the two edges: nothing
 * declared must resolve to nothing, and a pattern that would strip the manifest
 * must be rejected where it is written rather than surfacing later as a
 * "manifest missing" archive error.
 */

import { describe, expect, it } from "vitest";
import * as Result from "effect/Result";

import { protectedPublishPaths, resolvePublishIgnore } from "./publish-ignore.js";

describe("resolvePublishIgnore", () => {
  it("resolves to no patterns when nothing is declared", () => {
    expect(resolvePublishIgnore("skill", undefined)).toStrictEqual(Result.succeed([]));
    expect(resolvePublishIgnore("skill", [])).toStrictEqual(Result.succeed([]));
  });

  it("passes through patterns that leave protected paths alone", () => {
    const resolved = resolvePublishIgnore("skill", ["*.test.ts", "fixtures/*"]);

    expect(Result.isSuccess(resolved)).toBe(true);
    expect(Result.getOrElse(resolved, () => [])).toEqual(["*.test.ts", "fixtures/*"]);
  });

  it("rejects a pattern that names the manifest outright", () => {
    const resolved = resolvePublishIgnore("skill", ["skill.json"]);

    expect(Result.isFailure(resolved)).toBe(true);
    if (Result.isFailure(resolved)) {
      expect(resolved.failure.path).toBe("skill.json");
      expect(resolved.failure.pattern).toBe("skill.json");
    }
  });

  it("rejects a wildcard that would sweep up the manifest", () => {
    const resolved = resolvePublishIgnore("hook", ["*"]);

    expect(Result.isFailure(resolved)).toBe(true);
    if (Result.isFailure(resolved)) {
      expect(resolved.failure.path).toBe("hook.json");
      expect(resolved.failure.detail).toContain("cannot be published without it");
    }
  });

  it("protects the manifest of the type being published, not another type's", () => {
    expect(protectedPublishPaths("knowledge")).toEqual(["knowledge.json"]);
    expect(Result.isSuccess(resolvePublishIgnore("knowledge", ["skill.json"]))).toBe(true);
  });
});
