import { describe, expect, it } from "vitest";

import {
  displayWidth,
  padDisplay,
  renderedRows,
  truncateDisplay,
  truncateLine,
  wrapDisplay,
} from "./width.js";

describe("terminal display width", () => {
  it("counts wide characters as two columns and ignores ANSI", () => {
    expect(displayWidth("a界b")).toBe(4);
    expect(displayWidth("\u001b[31mred\u001b[0m")).toBe(3);
  });

  it("keeps combining sequences together and measures presentation selectors at zero", () => {
    expect(displayWidth("e\u0301x")).toBe(2);
    expect(displayWidth("☕️")).toBe(2);
    expect(truncateDisplay("e\u0301x", 1)).toBe("e\u0301");
  });

  it("pads, truncates, and wraps by display columns", () => {
    expect(padDisplay("界", 4)).toBe("界  ");
    expect(truncateDisplay("ab界cd", 5)).toBe("ab界…");
    expect(wrapDisplay("alpha beta gamma", 10)).toEqual(["alpha beta", "gamma"]);
  });

  describe("shortening a name in the middle", () => {
    const name = "@acme-enterprise/skills/audits/soc2-review";

    it("shortens the scope and keeps every segment after it", () => {
      expect(truncateDisplay(name, 40, "middle")).toBe("@acme-enterpr…/skills/audits/soc2-review");
      expect(truncateDisplay(name, 30, "middle")).toBe("@ac…/skills/audits/soc2-review");
    });

    it("keeps the type segment, which is what tells two names apart", () => {
      expect(truncateDisplay("@acme-enterprise/skills/soc2-evidence-review", 35, "middle")).toBe(
        "@acme-…/skills/soc2-evidence-review",
      );
    });

    it("gives what is left to the last segment once no scope worth keeping fits", () => {
      expect(truncateDisplay(name, 27, "middle")).toBe("@acme-enterpri…/soc2-review");
    });

    it("leaves a name that fits untouched", () => {
      expect(truncateDisplay(name, 50, "middle")).toBe(name);
    });

    it("keeps both ends when there is no middle segment to drop", () => {
      expect(truncateDisplay("soc2-evidence-review-and-triage", 14, "middle")).toBe(
        "soc2-ev…triage",
      );
    });

    it("never splits a wide character in half", () => {
      expect(displayWidth(truncateDisplay("界界界界界界", 7, "middle"))).toBeLessThanOrEqual(7);
    });
  });

  describe("a line the terminal rewrapped", () => {
    it("fills one row while it fits, and a further row for every wrap", () => {
      expect(renderedRows(59, 60)).toBe(1);
      expect(renderedRows(0, 60)).toBe(1);
      expect(renderedRows(79, 60)).toBe(2);
      expect(renderedRows(120, 60)).toBe(2);
      expect(renderedRows(121, 60)).toBe(3);
    });
  });

  describe("cutting a painted line", () => {
    it("leaves a line that fits untouched, with its styling", () => {
      const line = "\u001b[31mred\u001b[0m";
      expect(truncateLine(line, 3)).toBe(line);
    });

    it("marks the cut with an ellipsis and never exceeds the width", () => {
      expect(truncateLine("alphabet", 5)).toBe("alph\u2026");
      expect(displayWidth(truncateLine("\u754c\u754c\u754c\u754c", 5))).toBeLessThanOrEqual(5);
    });

    it("closes a hyperlink it cut in two", () => {
      const link = "\u001b]8;;https://example.test\u001b\\a long link label\u001b]8;;\u001b\\";
      const cut = truncateLine(link, 6);
      expect(displayWidth(cut)).toBe(6);
      expect(cut.endsWith("\u001b]8;;\u001b\\")).toBe(true);
    });

    it("keeps the styling it cut through and closes it", () => {
      const cut = truncateLine("\u001b[31mred and more\u001b[0m", 5);
      expect(cut).toContain("\u001b[31m");
      expect(displayWidth(cut)).toBe(5);
      expect(cut.endsWith("\u001b[0m")).toBe(true);
    });
  });
});
