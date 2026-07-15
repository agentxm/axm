import { describe, expect, it } from "@effect/vitest";

import { markdownSemanticallyEquivalent } from "./semantic-equivalence.js";

describe("markdownSemanticallyEquivalent", () => {
  it("ignores the documented semantics-preserving perturbation class", () => {
    const left = "# Review\n\nUse *care* when reviewing a long line of prose.\n\n- one\n- two\n";
    const right =
      "# Review\r\n\r\nUse _care_ when reviewing a long\r\nline of prose.\r\n\r\n* one\r\n* two\r\n";

    expect(markdownSemanticallyEquivalent(left, right)).toBe(true);
  });

  it("detects meaning-changing edits", () => {
    expect(markdownSemanticallyEquivalent("Run the tests.\n", "Skip the tests.\n")).toBe(false);
    expect(markdownSemanticallyEquivalent("Use *care*.\n", "Use care.\n")).toBe(false);
  });

  it("preserves whitespace semantics inside code", () => {
    expect(markdownSemanticallyEquivalent("```\na  b\n```\n", "```\na b\n```\n")).toBe(false);
  });
});
