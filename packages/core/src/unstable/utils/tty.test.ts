import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isInteractive } from "./tty.js";

describe("TTY detection utilities", () => {
  const originalStdin = process.stdin;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(process, "stdin", { value: originalStdin });
  });

  describe("isInteractive", () => {
    it("returns true when stdin.isTTY is true", () => {
      Object.defineProperty(process, "stdin", {
        value: { isTTY: true },
        configurable: true,
      });
      expect(isInteractive()).toBe(true);
    });

    it("returns false when stdin.isTTY is false", () => {
      Object.defineProperty(process, "stdin", {
        value: { isTTY: false },
        configurable: true,
      });
      expect(isInteractive()).toBe(false);
    });

    it("returns false when stdin.isTTY is undefined", () => {
      Object.defineProperty(process, "stdin", {
        value: { isTTY: undefined },
        configurable: true,
      });
      expect(isInteractive()).toBe(false);
    });
  });
});
