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
    group: vi.fn().mockReturnThis(),
  };

  // Cast once at the boundary - yargs types are too complex for mocks
  return { mockYargs: mock as unknown as Argv, capturedPositionals, capturedOptions };
};

describe("skills install command", () => {
  const createParser = () => yargs().command(installCommand).exitProcess(false);

  it("registers with correct description", () => {
    expect(installCommand.describe).toBe("Install skills from GitHub or local path");
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
  it("defines --scope option with string type and default project", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedOptions["scope"]).toEqual(
        expect.objectContaining({
          type: "string",
          default: "project",
        }),
      );
    }
  });

  it("does not define --agent option (removed)", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedOptions["agent"]).toBeUndefined();
    }
  });

  it("does not define --list option (removed)", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedOptions["list"]).toBeUndefined();
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

  it("does not define --yes option (global flag)", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedOptions["yes"]).toBeUndefined();
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

  it("does not define --force option (global flag)", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedOptions["force"]).toBeUndefined();
    }
  });

  it("includes description for --scope option", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedOptions["scope"]?.describe).toBeDefined();
      expect(capturedOptions["scope"]?.describe).toContain("Configuration scope");
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

  it("includes description for --all option", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedOptions["all"]?.describe).toBeDefined();
      expect(capturedOptions["all"]?.describe).toContain("all");
    }
  });

  it("does not define --non-interactive option (global flag)", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installCommand.builder === "function") {
      installCommand.builder(mockYargs);
      expect(capturedOptions["non-interactive"]).toBeUndefined();
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
      group: vi.fn().mockReturnThis(),
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

    expect(argv["scope"]).toBe("project");
    expect(argv["all"]).toBe(false);
    expect(argv["skill"]).toEqual([]);
  });

  it("parses --scope user", async () => {
    const argv = await createParser().parse(["install", "owner/repo", "--scope", "user"]);

    expect(argv["scope"]).toBe("user");
  });

  it("parses --all flag", async () => {
    const argv = await createParser().parse(["install", "owner/repo", "--all"]);

    expect(argv["all"]).toBe(true);
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
      "--scope",
      "user",
      "--skill",
      "pr-review",
    ]);

    expect(argv["source"]).toBe("owner/repo");
    expect(argv["scope"]).toBe("user");
    expect(argv["skill"]).toEqual(["pr-review"]);
  });
});
