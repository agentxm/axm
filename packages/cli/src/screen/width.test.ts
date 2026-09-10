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
});
