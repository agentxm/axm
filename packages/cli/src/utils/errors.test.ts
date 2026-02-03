import { describe, expect, it } from "vitest";
import { formatEmptyResolutionError, formatError } from "./errors.js";

describe("formatError", () => {
  it("formats error with only what happened", () => {
    const result = formatError("Could not find configuration file");
    expect(result).toBe("\u2717 Could not find configuration file");
  });

  it("formats error with details", () => {
    const result = formatError("Could not find configuration file", [
      "Looked for: .axm/settings.json",
    ]);
    expect(result).toBe(
      "\u2717 Could not find configuration file\n  Looked for: .axm/settings.json",
    );
  });

  it("formats error with multiple details", () => {
    const result = formatError("Failed to connect", [
      "Attempted: localhost:3000",
      "Timeout: 5000ms",
    ]);
    expect(result).toBe("\u2717 Failed to connect\n  Attempted: localhost:3000\n  Timeout: 5000ms");
  });

  it("formats error with how to fix", () => {
    const result = formatError(
      "Could not find configuration file",
      undefined,
      "Run 'axm init' to create one.",
    );
    expect(result).toBe(
      "\u2717 Could not find configuration file\n  Run 'axm init' to create one.",
    );
  });

  it("formats error with details and how to fix", () => {
    const result = formatError(
      "Could not find configuration file",
      ["Looked for: .axm/settings.json"],
      "Run 'axm init' to create one.",
    );
    expect(result).toBe(
      "\u2717 Could not find configuration file\n  Looked for: .axm/settings.json\n  Run 'axm init' to create one.",
    );
  });

  it("handles empty details array", () => {
    const result = formatError("Something went wrong", [], "Try again later.");
    expect(result).toBe("\u2717 Something went wrong\n  Try again later.");
  });

  it("formats complete error message matching DES-3 example", () => {
    const result = formatError(
      "Could not find configuration file",
      ["Looked for: .axm/settings.json"],
      "Run 'axm init' to create one.",
    );
    // Match the exact format from DES-3 in design.md
    expect(result).toContain("\u2717 Could not find configuration file");
    expect(result).toContain("  Looked for: .axm/settings.json");
    expect(result).toContain("  Run 'axm init' to create one.");
  });
});

describe("formatEmptyResolutionError", () => {
  it("formats error with input in message", () => {
    const result = formatEmptyResolutionError("my-skill");
    expect(result).toContain('Could not resolve "my-skill"');
  });

  it("includes no matching extensions detail", () => {
    const result = formatEmptyResolutionError("some-input");
    expect(result).toContain("No matching extensions found");
  });

  it("includes format suggestions in how to fix", () => {
    const result = formatEmptyResolutionError("test");
    expect(result).toContain("Try one of these formats:");
    expect(result).toContain("Local path:");
    expect(result).toContain("GitHub:");
    expect(result).toContain("GitLab:");
    expect(result).toContain("URL:");
    expect(result).toContain("AXM name:");
  });

  it("uses formatError internally (has X marker)", () => {
    const result = formatEmptyResolutionError("test");
    expect(result).toMatch(/^✗/);
  });
});
