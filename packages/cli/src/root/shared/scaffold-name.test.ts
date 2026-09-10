import { describe, expect, it } from "vitest";
import {
  isValidScaffoldName,
  normalizeScaffoldOwner,
  scaffoldNameValidationSuggestion,
} from "./scaffold-name.js";

describe("scaffold name helpers", () => {
  it("validates scaffold names with the shared command pattern", () => {
    expect(isValidScaffoldName("my-command")).toBe(true);
    expect(isValidScaffoldName("a")).toBe(true);
    expect(isValidScaffoldName("")).toBe(false);
    expect(isValidScaffoldName("-bad")).toBe(false);
    expect(isValidScaffoldName("Bad")).toBe(false);
    expect(isValidScaffoldName("a".repeat(65))).toBe(false);
  });

  it("normalizes owner handles with or without @", () => {
    expect(normalizeScaffoldOwner("@Acme")).toBe("@acme");
    expect(normalizeScaffoldOwner("Acme")).toBe("@acme");
  });

  it("keeps the shared validation suggestion stable", () => {
    expect(scaffoldNameValidationSuggestion).toBe(
      "Choose a name matching /^[a-z0-9][a-z0-9-]*$/ (max 64 chars)",
    );
  });
});
