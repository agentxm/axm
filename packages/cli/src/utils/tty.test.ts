import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isFancyOutput, isInteractive } from "./tty.js";

describe("TTY detection utilities", () => {
  const originalStdin = process.stdin;
  const originalStdout = process.stdout;

  beforeEach(() => {
    // Reset mocks before each test
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // Restore original properties after each test
    Object.defineProperty(process, "stdin", { value: originalStdin });
    Object.defineProperty(process, "stdout", { value: originalStdout });
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

  describe("isFancyOutput", () => {
    it("returns true when stdout.isTTY is true", () => {
      Object.defineProperty(process, "stdout", {
        value: { isTTY: true },
        configurable: true,
      });
      expect(isFancyOutput()).toBe(true);
    });

    it("returns false when stdout.isTTY is false", () => {
      Object.defineProperty(process, "stdout", {
        value: { isTTY: false },
        configurable: true,
      });
      expect(isFancyOutput()).toBe(false);
    });

    it("returns false when stdout.isTTY is undefined", () => {
      Object.defineProperty(process, "stdout", {
        value: { isTTY: undefined },
        configurable: true,
      });
      expect(isFancyOutput()).toBe(false);
    });
  });
});
