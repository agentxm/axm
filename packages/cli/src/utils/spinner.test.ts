import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSpinnerHelper } from "./spinner.js";

// Mock @clack/prompts
vi.mock("@clack/prompts", () => {
  const mockSpinner = {
    start: vi.fn(),
    stop: vi.fn(),
  };

  return {
    spinner: vi.fn(() => mockSpinner),
    log: {
      info: vi.fn(),
    },
  };
});

// Import after mocking
import * as p from "@clack/prompts";

describe("createSpinnerHelper", () => {
  const originalStdout = process.stdout;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(process, "stdout", { value: originalStdout });
  });

  describe("when stdout is a TTY (fancy output available)", () => {
    beforeEach(() => {
      Object.defineProperty(process, "stdout", {
        value: { isTTY: true },
        configurable: true,
      });
    });

    it("creates a spinner for start/stop operations", () => {
      const helper = createSpinnerHelper();
      expect(p.spinner).toHaveBeenCalledOnce();
      expect(helper).toBeDefined();
    });

    it("start() calls spinner.start with the message", () => {
      const helper = createSpinnerHelper();
      const mockResult = (p.spinner as ReturnType<typeof vi.fn>).mock.results[0];
      const mockSpinner = mockResult?.value as {
        start: ReturnType<typeof vi.fn>;
        stop: ReturnType<typeof vi.fn>;
      };

      helper.start("Loading...");
      expect(mockSpinner.start).toHaveBeenCalledWith("Loading...");
      expect(p.log.info).not.toHaveBeenCalled();
    });

    it("stop() calls spinner.stop with the message", () => {
      const helper = createSpinnerHelper();
      const mockResult = (p.spinner as ReturnType<typeof vi.fn>).mock.results[0];
      const mockSpinner = mockResult?.value as {
        start: ReturnType<typeof vi.fn>;
        stop: ReturnType<typeof vi.fn>;
      };

      helper.stop("Done!");
      expect(mockSpinner.stop).toHaveBeenCalledWith("Done!");
      expect(p.log.info).not.toHaveBeenCalled();
    });
  });

  describe("when stdout is not a TTY (plain text fallback)", () => {
    beforeEach(() => {
      Object.defineProperty(process, "stdout", {
        value: { isTTY: false },
        configurable: true,
      });
    });

    it("does not create a spinner", () => {
      createSpinnerHelper();
      expect(p.spinner).not.toHaveBeenCalled();
    });

    it("start() calls p.log.info with the message", () => {
      const helper = createSpinnerHelper();

      helper.start("Loading...");
      expect(p.log.info).toHaveBeenCalledWith("Loading...");
    });

    it("stop() calls p.log.info with the message", () => {
      const helper = createSpinnerHelper();

      helper.stop("Done!");
      expect(p.log.info).toHaveBeenCalledWith("Done!");
    });
  });

  describe("when stdout.isTTY is undefined", () => {
    beforeEach(() => {
      Object.defineProperty(process, "stdout", {
        value: { isTTY: undefined },
        configurable: true,
      });
    });

    it("falls back to plain text logging", () => {
      const helper = createSpinnerHelper();

      helper.start("Loading...");
      expect(p.log.info).toHaveBeenCalledWith("Loading...");
      expect(p.spinner).not.toHaveBeenCalled();
    });
  });
});
