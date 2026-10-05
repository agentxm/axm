import { describe, expect, it } from "@effect/vitest";
import { normalizeCallerAgent } from "./caller-agent.js";
describe("Caller agent adapter", () => {
  it.each([
    [undefined, "unknown"],
    ["human", "unknown"],
    ["arbitrary environment value", "unknown"],
    ["claude_code", "claude-code"],
    ["open_code", "opencode"],
    ["codex", "codex"],
    ["codex_cli", "codex"],
    ["gemini_cli", "gemini-cli"],
  ])("normalizes %s without exposing metadata", (input, expected) => {
    expect(normalizeCallerAgent(input, {})).toBe(expected);
  });
  it("requires a strong Cursor signal beyond the terminal", () => {
    expect(normalizeCallerAgent("cursor", { TERM_PROGRAM: "vscode", CURSOR_TERMINAL: "1" })).toBe(
      "unknown",
    );
    expect(normalizeCallerAgent("cursor-cli", { CURSOR_AGENT: "1" })).toBe("cursor");
    expect(normalizeCallerAgent("cursor", { CURSOR_TRACE_ID: "trace" })).toBe("cursor");
    expect(normalizeCallerAgent("cursor", { CURSOR_EXTENSION_HOST_ROLE: "agent-exec" })).toBe(
      "cursor",
    );
  });
});
