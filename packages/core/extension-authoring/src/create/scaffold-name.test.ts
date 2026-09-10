import { describe, expect, it } from "vitest";

import {
  SCAFFOLD_NAME_MAX_LENGTH,
  isValidScaffoldName,
  normalizeScaffoldOwner,
} from "./scaffold-name.js";

describe("scaffold name helpers", () => {
  it("validates scaffold names with the shared authoring pattern", () => {
    expect(isValidScaffoldName("my-command")).toBe(true);
    expect(isValidScaffoldName("a")).toBe(true);
    expect(isValidScaffoldName("")).toBe(false);
    expect(isValidScaffoldName("-bad")).toBe(false);
    expect(isValidScaffoldName("Bad")).toBe(false);
    expect(isValidScaffoldName("a".repeat(SCAFFOLD_NAME_MAX_LENGTH + 1))).toBe(false);
    expect(isValidScaffoldName("a".repeat(SCAFFOLD_NAME_MAX_LENGTH))).toBe(true);
  });

  it("normalizes owner handles with or without @", () => {
    expect(normalizeScaffoldOwner("@Acme")).toBe("@acme");
    expect(normalizeScaffoldOwner("Acme")).toBe("@acme");
  });
});
