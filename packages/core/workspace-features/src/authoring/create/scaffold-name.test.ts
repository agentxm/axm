import { describe, expect, it } from "vitest";

import { normalizeScaffoldOwner } from "./scaffold-name.js";

describe("scaffold name helpers", () => {
  it("normalizes owner handles with or without @", () => {
    expect(normalizeScaffoldOwner("@Acme")).toBe("@acme");
    expect(normalizeScaffoldOwner("Acme")).toBe("@acme");
  });
});
