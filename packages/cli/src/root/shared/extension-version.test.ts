import { describe, expect, it } from "@effect/vitest";
import { extensionTypes } from "@agentxm/client-core/unstable/extensions";
import { VERSIONABLE_TYPES, isVersionableType, versionableTypes } from "./extension-version.js";

describe("versionable type policy", () => {
  it("covers every extension type; files, rule, and knowledge stay false", () => {
    expect(Object.keys(VERSIONABLE_TYPES).sort()).toEqual([...extensionTypes].sort());
    for (const type of extensionTypes) {
      expect(isVersionableType(type)).toBe(
        type !== "files" && type !== "rule" && type !== "knowledge",
      );
    }
  });

  it("keeps the ordered list aligned with the policy record", () => {
    expect([...versionableTypes].sort()).toEqual(extensionTypes.filter(isVersionableType).sort());
  });
});
