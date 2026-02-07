/**
 * Unit tests for the skills install command yargs definition.
 *
 * Tests verify command description, positional arguments, options, and defaults.
 * Handler logic is tested separately in handler.test.ts.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it, vi } from "vitest";
import yargs, { type Argv, type Options, type PositionalOptions } from "yargs";
import { installCommand } from "./command.js";

/**
 * Type for captured yargs option configurations.
 */
type CapturedOptions = Record<string, Options>;
type CapturedPositionals = Record<string, PositionalOptions>;

/**
 * Creates a mock yargs instance that records positional() and option() calls.
 * Returns the mock along with helpers to retrieve captured options.
 *
 * Note: yargs Argv has complex overloaded signatures that mocks cannot satisfy.
 * We cast to Argv at the boundary rather than using `as any` throughout.
 */
const createCapturingMock = () => {
  const capturedPositionals: CapturedPositionals = {};
  const capturedOptions: CapturedOptions = {};

  // Build mock object - methods return self for chaining
  const mock = {
    positional: vi.fn((name: string, config: PositionalOptions) => {
      capturedPositionals[name] = config;
      return mock;
    }),
    option: vi.fn((name: string, config: Options) => {
      capturedOptions[name] = config;
      return mock;
    }),
    example: vi.fn().mockReturnThis(),
  };

  // Cast once at the boundary - yargs types are too complex for mocks
  return { mockYargs: mock as unknown as Argv, capturedPositionals, capturedOptions };
};

describe("skills install command", () => {
  const createParser = () => yargs().command(installCommand).exitProcess(false);

  it("registers with correct description", () => {
    expect(installCommand.describe).toBe("Install skills from a GitHub repo, local path, or URL");
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("install <source>");
    expect(helpOutput).toContain("Install skills");
  });
});

describe("skills install command positional", () => {
  it("defines source positional argument as required string", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedPositionals["source"]).toEqual(
        expect.objectContaining({
          type: "string",
          demandOption: true,
        }),
      );
    }
  });

  it("includes description for source positional", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedPositionals["source"]?.describe).toBeDefined();
      expect(capturedPositionals["source"]?.describe).toContain("GitHub");
    }
  });
});

describe("skills install command options", () => {
  it("defines --global option with boolean type and default false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
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

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedOptions["agent"]).toEqual(
        expect.objectContaining({
          type: "string",
          array: true,
          default: [],
        }),
      );
    }
  });

  it("defines --skill option as string array with empty default", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedOptions["skill"]).toEqual(
        expect.objectContaining({
          type: "string",
          array: true,
          default: [],
        }),
      );
    }
  });

  it("defines --yes option with boolean type, alias, and default false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedOptions["yes"]).toEqual(
        expect.objectContaining({
          type: "boolean",
          alias: "y",
          default: false,
        }),
      );
    }
  });

  it("defines --list option with boolean type, alias, and default false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedOptions["list"]).toEqual(
        expect.objectContaining({
          type: "boolean",
          alias: "l",
          default: false,
        }),
      );
    }
  });

  it("defines --all option with boolean type and default false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedOptions["all"]).toEqual(
        expect.objectContaining({
          type: "boolean",
          default: false,
        }),
      );
    }
  });

  it("includes description for --global option", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedOptions["global"]?.describe).toBeDefined();
      expect(capturedOptions["global"]?.describe).toContain("global");
    }
  });

  it("includes description for --agent option", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedOptions["agent"]?.describe).toBeDefined();
      expect(capturedOptions["agent"]?.describe).toContain("agent");
    }
  });

  it("includes description for --skill option", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedOptions["skill"]?.describe).toBeDefined();
      expect(capturedOptions["skill"]?.describe).toContain("skill");
    }
  });

  it("includes description for --yes option", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedOptions["yes"]?.describe).toBeDefined();
      expect(capturedOptions["yes"]?.describe).toContain("prompts");
    }
  });

  it("includes description for --list option", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedOptions["list"]?.describe).toBeDefined();
      expect(capturedOptions["list"]?.describe).toContain("List");
    }
  });

  it("includes description for --all option", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedOptions["all"]?.describe).toBeDefined();
      expect(capturedOptions["all"]?.describe).toContain("all");
    }
  });

  it("defines --dry-run option with boolean type and no default", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedOptions["dry-run"]).toEqual(
        expect.objectContaining({
          type: "boolean",
        }),
      );
      expect(capturedOptions["dry-run"]?.default).toBeUndefined();
    }
  });

  it("defines --non-interactive option with boolean type and no default", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedOptions["non-interactive"]).toEqual(
        expect.objectContaining({
          type: "boolean",
        }),
      );
      expect(capturedOptions["non-interactive"]?.default).toBeUndefined();
    }
  });

  it("includes description for --dry-run option", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedOptions["dry-run"]?.describe).toBeDefined();
    }
  });

  it("includes description for --non-interactive option", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedOptions["non-interactive"]?.describe).toBeDefined();
    }
  });
});

describe("skills install command examples", () => {
  it("registers usage examples", () => {
    // Build mock object - methods return self for chaining
    const mock = {
      positional: vi.fn().mockReturnThis(),
      option: vi.fn().mockReturnThis(),
      example: vi.fn().mockReturnThis(),
    };

    if (typeof installCommand.builder === "function") {
      // Cast once at the boundary - yargs types are too complex for mocks
      installCommand.builder(mock as unknown as Argv);
      expect(mock.example).toHaveBeenCalled();
      // Verify multiple examples are provided for this complex command
      expect(mock.example.mock.calls.length).toBeGreaterThan(3);
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
describe("skills install command parser", () => {
  /**
   * Creates a yargs parser configured for testing.
   * - Uses installCommand.builder for option definitions but no handler
   * - exitProcess(false): Prevents process.exit() on errors
   * - fail(false): Throws errors instead of printing to stderr
   */
  const createParser = () =>
    yargs()
      .command({
        command: installCommand.command,
        describe: installCommand.describe,
        builder: installCommand.builder,
        handler: () => {}, // No-op handler - we only want to test parsing
      })
      .exitProcess(false)
      .fail(false);

  it("requires source positional argument", async () => {
    // yargs throws synchronously when required positional is missing with fail(false)
    // We wrap in a try/catch to verify the error
    let error: Error | null = null;
    try {
      await createParser().parse(["install"]);
    } catch (e) {
      error = e as Error;
    }
    expect(error).not.toBeNull();
    expect(error?.message).toContain("Not enough non-option arguments");
  });

  it("parses source positional argument", async () => {
    const argv = await createParser().parse(["install", "owner/repo"]);

    expect(argv["source"]).toBe("owner/repo");
  });

  it("parses with default values when no options provided", async () => {
    const argv = await createParser().parse(["install", "owner/repo"]);

    expect(argv["global"]).toBe(false);
    expect(argv["yes"]).toBe(false);
    expect(argv["list"]).toBe(false);
    expect(argv["all"]).toBe(false);
    expect(argv["agent"]).toEqual([]);
    expect(argv["skill"]).toEqual([]);
  });

  it("parses --global flag", async () => {
    const argv = await createParser().parse(["install", "owner/repo", "--global"]);

    expect(argv["global"]).toBe(true);
  });

  it("parses --yes flag", async () => {
    const argv = await createParser().parse(["install", "owner/repo", "--yes"]);

    expect(argv["yes"]).toBe(true);
  });

  it("parses -y alias for --yes", async () => {
    const argv = await createParser().parse(["install", "owner/repo", "-y"]);

    expect(argv["yes"]).toBe(true);
  });

  it("parses --list flag", async () => {
    const argv = await createParser().parse(["install", "owner/repo", "--list"]);

    expect(argv["list"]).toBe(true);
  });

  it("parses -l alias for --list", async () => {
    const argv = await createParser().parse(["install", "owner/repo", "-l"]);

    expect(argv["list"]).toBe(true);
  });

  it("parses --all flag", async () => {
    const argv = await createParser().parse(["install", "owner/repo", "--all"]);

    expect(argv["all"]).toBe(true);
  });

  it("parses single --agent value", async () => {
    const argv = await createParser().parse(["install", "owner/repo", "--agent", "claude-code"]);

    expect(argv["agent"]).toEqual(["claude-code"]);
  });

  it("parses multiple --agent values", async () => {
    const argv = await createParser().parse([
      "install",
      "owner/repo",
      "--agent",
      "claude-code",
      "--agent",
      "cursor",
    ]);

    expect(argv["agent"]).toEqual(["claude-code", "cursor"]);
  });

  it("parses single --skill value", async () => {
    const argv = await createParser().parse(["install", "owner/repo", "--skill", "pr-review"]);

    expect(argv["skill"]).toEqual(["pr-review"]);
  });

  it("parses multiple --skill values", async () => {
    const argv = await createParser().parse([
      "install",
      "owner/repo",
      "--skill",
      "pr-review",
      "--skill",
      "commit",
    ]);

    expect(argv["skill"]).toEqual(["pr-review", "commit"]);
  });

  it("parses combination of flags", async () => {
    const argv = await createParser().parse([
      "install",
      "owner/repo",
      "--global",
      "-y",
      "-l",
      "--agent",
      "claude-code",
      "--skill",
      "pr-review",
    ]);

    expect(argv["source"]).toBe("owner/repo");
    expect(argv["global"]).toBe(true);
    expect(argv["yes"]).toBe(true);
    expect(argv["list"]).toBe(true);
    expect(argv["agent"]).toEqual(["claude-code"]);
    expect(argv["skill"]).toEqual(["pr-review"]);
  });
});
