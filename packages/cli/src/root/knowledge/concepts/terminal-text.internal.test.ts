import { describe, expect, it } from "vitest";
import { sanitizeKnowledgeTerminalText } from "./terminal-text.js";

describe("knowledge terminal text", () => {
  it("neutralizes escape, OSC, control, and bidi code points while preserving normal text", () => {
    const authored = "safe\u001b]8;;https://evil.example\u0007link\u001b[31m\u202ereversed";
    const rendered = sanitizeKnowledgeTerminalText(authored);

    expect(rendered).toBe(
      "safe\\u{001b}]8;;https://evil.example\\u{0007}link\\u{001b}[31m\\u{202e}reversed",
    );
    expect(rendered).not.toContain("\u001b");
    expect(rendered).not.toContain("\u0007");
    expect(rendered).not.toContain("\u202e");
  });

  it("preserves newlines and tabs for readable concept bodies", () => {
    expect(sanitizeKnowledgeTerminalText("one\ttwo\nthree")).toBe("one\ttwo\nthree");
  });
});
