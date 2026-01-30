/**
 * Unit tests for the init command yargs definition.
 *
 * Tests verify command description, options, and defaults.
 * Handler logic is tested separately in handler.test.ts.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it, vi } from "vitest";
import yargs from "yargs";
import { initCommand } from "./command.js";

describe("init command", () => {
  const createParser = () => yargs().command(initCommand).exitProcess(false);

  it("registers with correct description", () => {
    expect(initCommand.describe).toBe(
      "Initialize axm by detecting installed agents and creating .axm/settings.json",
    );
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("init");
    expect(helpOutput).toContain("Initialize axm");
  });
});

describe("init command options", () => {
  /**
   * Creates a mock yargs instance that records option() calls.
   * Returns the mock along with a helper to retrieve captured options.
   */
  const createOptionCapturingMock = () => {
    const capturedOptions: Record<string, unknown> = {};
    const mockYargs = {
      option: vi.fn((name: string, config: unknown) => {
        capturedOptions[name] = config;
        return mockYargs;
      }),
      example: vi.fn().mockReturnThis(),
    };
    return { mockYargs, capturedOptions };
  };

  it("defines --yes option with boolean type and default false", () => {
    const { mockYargs, capturedOptions } = createOptionCapturingMock();

    if (typeof initCommand.builder === "function") {
      initCommand.builder(mockYargs as any);
      expect(capturedOptions["yes"]).toEqual(
        expect.objectContaining({
          type: "boolean",
          alias: "y",
          default: false,
        }),
      );
    }
  });

  it("defines --global option with boolean type and default false", () => {
    const { mockYargs, capturedOptions } = createOptionCapturingMock();

    if (typeof initCommand.builder === "function") {
      initCommand.builder(mockYargs as any);
      expect(capturedOptions["global"]).toEqual(
        expect.objectContaining({
          type: "boolean",
          default: false,
        }),
      );
    }
  });

  it("defines --agent option as string array with empty default", () => {
    const { mockYargs, capturedOptions } = createOptionCapturingMock();

    if (typeof initCommand.builder === "function") {
      initCommand.builder(mockYargs as any);
      expect(capturedOptions["agent"]).toEqual(
        expect.objectContaining({
          type: "string",
          array: true,
          default: [],
        }),
      );
    }
  });

  it("includes description for --yes option", () => {
    const { mockYargs, capturedOptions } = createOptionCapturingMock();

    if (typeof initCommand.builder === "function") {
      initCommand.builder(mockYargs as any);
      expect((capturedOptions["yes"] as any).describe).toBeDefined();
      expect((capturedOptions["yes"] as any).describe).toContain("detected agents");
    }
  });

  it("includes description for --global option", () => {
    const { mockYargs, capturedOptions } = createOptionCapturingMock();

    if (typeof initCommand.builder === "function") {
      initCommand.builder(mockYargs as any);
      expect((capturedOptions["global"] as any).describe).toBeDefined();
      expect((capturedOptions["global"] as any).describe).toContain("globally");
    }
  });

  it("includes description for --agent option", () => {
    const { mockYargs, capturedOptions } = createOptionCapturingMock();

    if (typeof initCommand.builder === "function") {
      initCommand.builder(mockYargs as any);
      expect((capturedOptions["agent"] as any).describe).toBeDefined();
      expect((capturedOptions["agent"] as any).describe).toContain("agent");
    }
  });
});

describe("init command examples", () => {
  it("registers usage examples", () => {
    const mockYargs = {
      option: vi.fn().mockReturnThis(),
      example: vi.fn().mockReturnThis(),
    };

    if (typeof initCommand.builder === "function") {
      initCommand.builder(mockYargs as any);
      expect(mockYargs.example).toHaveBeenCalled();
      // Verify at least one example is provided
      expect(mockYargs.example.mock.calls.length).toBeGreaterThan(0);
    }
  });
});
