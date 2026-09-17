import { describe, expect, it } from "vitest";

import { displayWidth, padDisplay, truncateDisplay, wrapDisplay } from "./width.js";

describe("terminal display width", () => {
  it("counts wide characters as two columns and ignores ANSI", () => {
    expect(displayWidth("a界b")).toBe(4);
    expect(displayWidth("\u001b[31mred\u001b[0m")).toBe(3);
  });

  it("pads, truncates, and wraps by display columns", () => {
    expect(padDisplay("界", 4)).toBe("界  ");
    expect(truncateDisplay("ab界cd", 5)).toBe("ab界…");
    expect(wrapDisplay("alpha beta gamma", 10)).toEqual(["alpha beta", "gamma"]);
  });

  describe("shortening a name in the middle", () => {
    const name = "@acme-enterprise/skills/audits/soc2-review";

    it("drops whole middle segments, keeping the scope and the last one", () => {
      expect(truncateDisplay(name, 30, "middle")).toBe("@acme-enterprise/…/soc2-review");
    });

    it("keeps as many trailing segments as the width allows", () => {
      expect(truncateDisplay(name, 40, "middle")).toBe("@acme-enterprise/…/audits/soc2-review");
    });

    it("keeps the last segment whole once the scope no longer fits", () => {
      expect(truncateDisplay("@acme-enterprise/skills/soc2-evidence-review", 35, "middle")).toBe(
        "@acme-enterpr…/soc2-evidence-review",
      );
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
});
