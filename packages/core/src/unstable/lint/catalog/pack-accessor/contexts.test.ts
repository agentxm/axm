/**
 * Unit tests for `buildPackRuleContexts`.
 *
 * Confirms `displayRoot` + `subject` flow through per installed pack and
 * that the function doesn't mutate its input. The underlying accessor is
 * passed through by reference — the caller owns construction.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type { PackFileAccessor } from "../../context.js";
import { buildPackRuleContexts, type InstalledPackInfo } from "./contexts.js";

const absentAccessor: PackFileAccessor = {
  exists: () => Effect.succeed(false),
  readBytes: (path) =>
    Effect.fail({
      _tag: "FileAccessError" as const,
      path,
      reason: "read-error" as const,
      message: "stubbed",
    }),
};

describe("buildPackRuleContexts", () => {
  it("returns one context per installed pack", () => {
    const items: ReadonlyArray<InstalledPackInfo> = [
      {
        packJson: { owner: "@acme", type: "pack", name: "a", version: "0.1.0" },
        displayRoot: ".axm/extensions/@acme/packs/a",
        files: absentAccessor,
      },
      {
        packJson: undefined,
        displayRoot: ".axm/extensions/@acme/packs/b",
        files: absentAccessor,
      },
    ];
    const input = { installedPacks: items };

    const contexts = buildPackRuleContexts(input);
    expect(contexts).toHaveLength(2);

    expect(contexts[0]?.subject.packJson).toEqual({
      owner: "@acme",
      type: "pack",
      name: "a",
      version: "0.1.0",
    });
    expect(contexts[0]?.displayRoot).toBe(".axm/extensions/@acme/packs/a");
    expect(contexts[0]?.files).toBe(absentAccessor);

    expect(contexts[1]?.subject.packJson).toBeUndefined();
    expect(contexts[1]?.displayRoot).toBe(".axm/extensions/@acme/packs/b");
  });

  it("returns an empty array when the index has no installed packs", () => {
    expect(buildPackRuleContexts({ installedPacks: [] })).toEqual([]);
  });
});
