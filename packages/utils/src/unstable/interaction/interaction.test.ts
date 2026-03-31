import { describe, expect, it } from "vitest";
import { isAgent, isCI, isHumanInteractive, isInteractive } from "./interaction.js";

describe("isCI", () => {
  it("returns true when CI is set", () => {
    expect(isCI({ CI: "true" })).toBe(true);
  });

  it("returns false when CI is absent", () => {
    expect(isCI({})).toBe(false);
  });
});

describe("isAgent", () => {
  it("returns true for Claude Code sessions", () => {
    expect(isAgent({ CLAUDECODE: "1" })).toBe(true);
  });

  it("returns true for Gemini CLI sessions", () => {
    expect(isAgent({ GEMINI_CLI: "1" })).toBe(true);
  });

  it("returns true for Cursor agent sessions", () => {
    expect(isAgent({ CURSOR_AGENT: "1" })).toBe(true);
  });

  it("returns false for non-agent sessions", () => {
    expect(isAgent({})).toBe(false);
  });
});

describe("isInteractive", () => {
  it("returns true for a tty session without CI", () => {
    expect(isInteractive({ isTTY: true, env: {} })).toBe(true);
  });

  it("returns false when CI is enabled", () => {
    expect(isInteractive({ isTTY: true, env: { CI: "true" } })).toBe(false);
  });

  it("returns true for agent sessions", () => {
    expect(isInteractive({ isTTY: true, env: { CLAUDECODE: "1" } })).toBe(true);
  });

  it("returns false without a tty", () => {
    expect(isInteractive({ isTTY: false, env: {} })).toBe(false);
  });
});

describe("isHumanInteractive", () => {
  it("returns true for a human tty session", () => {
    expect(isHumanInteractive({ isTTY: true, env: {} })).toBe(true);
  });

  it("returns false when CI is enabled", () => {
    expect(isHumanInteractive({ isTTY: true, env: { CI: "true" } })).toBe(false);
  });

  it("returns false for agent sessions even with a tty", () => {
    expect(isHumanInteractive({ isTTY: true, env: { CLAUDECODE: "1" } })).toBe(false);
  });
});
