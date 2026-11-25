import { describe, expect, it } from "@effect/vitest";

import { extensionTypes } from "@agentxm/extension-model/unstable/extensions";

import { PUBLISHABLE_TYPES, isPublishableType } from "./publishable-types.js";

describe("publish type policy", () => {
  it("covers every extension type; every type is publishable", () => {
    expect(Object.keys(PUBLISHABLE_TYPES).sort()).toEqual([...extensionTypes].sort());
    for (const type of extensionTypes) {
      expect(isPublishableType(type)).toBe(true);
    }
  });
});
