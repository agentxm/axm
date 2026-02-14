/**
 * Unit tests for the init command yargs definition.
 *
 * Tests verify command description, options, and defaults.
 * Handler logic is tested separately in handler.test.ts.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it, vi } from "vitest";
import type { Argv, Options } from "yargs";
import yargs from "yargs";
import { initCommand } from "./command.js";

describe("init command", () => {
  const createParser = () => yargs().command(initCommand).exitProcess(false);

  it("registers with correct description", () => {
    expect(initCommand.describe).toBe("Set up axm in the current project");
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("init");
    expect(helpOutput).toContain("Set up axm");
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
      initCommand.builder(mockYargs as unknown as Argv);
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
      initCommand.builder(mockYargs as unknown as Argv);
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
      initCommand.builder(mockYargs as unknown as Argv);
      expect(capturedOptions["agent"]).toEqual(
        expect.objectContaining({
          type: "string",
          array: true,
          default: [],
        }),
      );
    }
  });

  it("defines --non-interactive option with boolean type and default false", () => {
    const { mockYargs, capturedOptions } = createOptionCapturingMock();

    if (typeof initCommand.builder === "function") {
      initCommand.builder(mockYargs as unknown as Argv);
      expect(capturedOptions["non-interactive"]).toEqual(
        expect.objectContaining({
          type: "boolean",
          default: false,
        }),
      );
    }
  });

  it("includes description for --yes option", () => {
    const { mockYargs, capturedOptions } = createOptionCapturingMock();

    if (typeof initCommand.builder === "function") {
      initCommand.builder(mockYargs as unknown as Argv);
      const yesOption = capturedOptions["yes"] as Options;
      expect(yesOption.describe).toBeDefined();
      expect(yesOption.describe).toContain("Skip confirmation prompts");
    }
  });

  it("includes description for --global option", () => {
    const { mockYargs, capturedOptions } = createOptionCapturingMock();

    if (typeof initCommand.builder === "function") {
      initCommand.builder(mockYargs as unknown as Argv);
      const globalOption = capturedOptions["global"] as Options;
      expect(globalOption.describe).toBeDefined();
      expect(globalOption.describe).toContain("globally");
    }
  });

  it("includes description for --agent option", () => {
    const { mockYargs, capturedOptions } = createOptionCapturingMock();

    if (typeof initCommand.builder === "function") {
      initCommand.builder(mockYargs as unknown as Argv);
      const agentOption = capturedOptions["agent"] as Options;
      expect(agentOption.describe).toBeDefined();
      expect(agentOption.describe).toContain("agent");
    }
  });

  it("includes description for --non-interactive option", () => {
    const { mockYargs, capturedOptions } = createOptionCapturingMock();

    if (typeof initCommand.builder === "function") {
      initCommand.builder(mockYargs as unknown as Argv);
      const nonInteractiveOption = capturedOptions["non-interactive"] as Options;
      expect(nonInteractiveOption.describe).toBeDefined();
      expect(nonInteractiveOption.describe).toContain("Disable all interactive prompts");
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
      initCommand.builder(mockYargs as unknown as Argv);
      expect(mockYargs.example).toHaveBeenCalled();
      // Verify at least one example is provided
      expect(mockYargs.example.mock.calls.length).toBeGreaterThan(0);
    }
  });
});

/**
 * Parser tests verify actual yargs parsing behavior.
 * These tests parse real command-line arguments and verify the parsed result.
 *
 * We create a handler-less version of the command to test parsing without
 * triggering side effects.
 */
describe("init command parser", () => {
  /**
   * Creates a yargs parser configured for testing.
   * - Uses initCommand.builder for option definitions but no handler
   * - exitProcess(false): Prevents process.exit() on errors
   * - fail(false): Throws errors instead of printing to stderr
   */
  const createParser = () =>
    yargs()
      .command({
        command: initCommand.command,
        describe: initCommand.describe,
        builder: initCommand.builder,
        handler: () => {}, // No-op handler - we only want to test parsing
      })
      .exitProcess(false)
      .fail(false);

  it("parses with default values when no options provided", async () => {
    const argv = await createParser().parse(["init"]);

    expect(argv["global"]).toBe(false);
    expect(argv["yes"]).toBe(false);
    expect(argv["agent"]).toEqual([]);
    expect(argv["non-interactive"]).toBe(false);
  });

  it("parses --global flag", async () => {
    const argv = await createParser().parse(["init", "--global"]);

    expect(argv["global"]).toBe(true);
  });

  it("parses --yes flag", async () => {
    const argv = await createParser().parse(["init", "--yes"]);

    expect(argv["yes"]).toBe(true);
  });

  it("parses -y alias for --yes", async () => {
    const argv = await createParser().parse(["init", "-y"]);

    expect(argv["yes"]).toBe(true);
  });

  it("parses single --agent value", async () => {
    const argv = await createParser().parse(["init", "--agent", "claude-code"]);

    expect(argv["agent"]).toEqual(["claude-code"]);
  });

  it("parses multiple --agent values", async () => {
    const argv = await createParser().parse([
      "init",
      "--agent",
      "claude-code",
      "--agent",
      "cursor",
    ]);

    expect(argv["agent"]).toEqual(["claude-code", "cursor"]);
  });

  it("parses --non-interactive flag", async () => {
    const argv = await createParser().parse(["init", "--non-interactive"]);

    expect(argv["non-interactive"]).toBe(true);
  });

  it("parses combination of flags", async () => {
    const argv = await createParser().parse([
      "init",
      "--global",
      "-y",
      "--agent",
      "claude-code",
      "--non-interactive",
    ]);

    expect(argv["global"]).toBe(true);
    expect(argv["yes"]).toBe(true);
    expect(argv["agent"]).toEqual(["claude-code"]);
    expect(argv["non-interactive"]).toBe(true);
  });
});
