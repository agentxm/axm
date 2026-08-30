import { describe, expect, it } from "@effect/vitest";
import { extensionTypes } from "@agentxm/extension-model/unstable/extensions";
import { VERSIONABLE_TYPES, isVersionableType, versionableTypes } from "./extension-version.js";

describe("versionable type policy", () => {
  it("covers every extension type; every type is versionable", () => {
    expect(Object.keys(VERSIONABLE_TYPES).sort()).toEqual([...extensionTypes].sort());
    for (const type of extensionTypes) {
      expect(isVersionableType(type)).toBe(true);
    }
  });

  it("keeps the ordered list aligned with the policy record", () => {
    expect([...versionableTypes].sort()).toEqual(extensionTypes.filter(isVersionableType).sort());
  });
});
