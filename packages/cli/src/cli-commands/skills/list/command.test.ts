/**
 * Unit tests for the skills list command yargs definition.
 *
 * Tests verify command description, options, defaults, and parsing behavior.
 * Handler logic is tested separately in handler.test.ts.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it, vi } from "vitest";
import yargs, { type Argv, type Options } from "yargs";
import { listCommand } from "./command.js";

/**
 * Type for captured yargs option configurations.
 */
type CapturedOptions = Record<string, Options>;

/**
 * Creates a mock yargs instance that records option() calls.
 * Returns the mock along with helpers to retrieve captured options.
 *
 * Note: yargs Argv has complex overloaded signatures that mocks cannot satisfy.
 * We cast to Argv at the boundary rather than using `as any` throughout.
 */
const createCapturingMock = () => {
  const capturedOptions: CapturedOptions = {};

  // Build mock object - methods return self for chaining
  const mock = {
    option: vi.fn((name: string, config: Options) => {
      capturedOptions[name] = config;
      return mock;
    }),
    example: vi.fn().mockReturnThis(),
  };

  // Cast once at the boundary - yargs types are too complex for mocks
  return { mockYargs: mock as unknown as Argv, capturedOptions };
};

describe("skills list command", () => {
  const createParser = () => yargs().command(listCommand).exitProcess(false);

  it("registers with correct description", () => {
    expect(listCommand.describe).toBe("List installed skills");
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("list");
  });
});

describe("skills list command options", () => {
  it("defines --global option with boolean type and default false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof listCommand.builder === "function") {
      listCommand.builder(mockYargs);
      expect(capturedOptions["global"]).toEqual(
        expect.objectContaining({
          type: "boolean",
          default: false,
        }),
      );
    }
  });

  it("defines --agent option as string array with empty default", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof listCommand.builder === "function") {
      listCommand.builder(mockYargs);
      expect(capturedOptions["agent"]).toEqual(
        expect.objectContaining({
          type: "string",
          array: true,
          default: [],
        }),
      );
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
describe("skills list command parser", () => {
  /**
   * Creates a yargs parser configured for testing.
   * - Uses listCommand.builder for option definitions but no handler
   * - exitProcess(false): Prevents process.exit() on errors
   * - fail(false): Throws errors instead of printing to stderr
   */
  const createParser = () =>
    yargs()
      .command({
        command: listCommand.command,
        describe: listCommand.describe,
        builder: listCommand.builder,
        handler: () => {},
      })
      .exitProcess(false)
      .fail(false);

  it("parses with default values", async () => {
    const argv = await createParser().parse(["list"]);

    expect(argv["global"]).toBe(false);
    expect(argv["agent"]).toEqual([]);
  });

  it("parses --global flag", async () => {
    const argv = await createParser().parse(["list", "--global"]);

    expect(argv["global"]).toBe(true);
  });

  it("parses single --agent value", async () => {
    const argv = await createParser().parse(["list", "--agent", "claude-code"]);

    expect(argv["agent"]).toEqual(["claude-code"]);
  });

  it("parses multiple --agent values", async () => {
    const argv = await createParser().parse([
      "list",
      "--agent",
      "claude-code",
      "--agent",
      "cursor",
    ]);

    expect(argv["agent"]).toEqual(["claude-code", "cursor"]);
  });

  it("parses --agent with --global", async () => {
    const argv = await createParser().parse(["list", "--global", "--agent", "claude-code"]);

    expect(argv["global"]).toBe(true);
    expect(argv["agent"]).toEqual(["claude-code"]);
  });
});
