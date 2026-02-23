/**
 * Unit tests for the skills update command yargs definition.
 *
 * Tests verify command description, positional arguments, options, and defaults.
 * Handler logic is tested separately in handler.test.ts.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it, vi } from "vitest";
import yargs, { type Argv, type Options, type PositionalOptions } from "yargs";
import { updateCommand } from "./command.js";

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

describe("skills update command", () => {
  const createParser = () => yargs().command(updateCommand).exitProcess(false);

  it("registers with correct description", () => {
    expect(updateCommand.describe).toBe("Update installed skills to latest versions");
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("update [source]");
    expect(helpOutput).toContain("Update installed skills");
  });
});

describe("skills update command positional", () => {
  it("defines source positional argument as optional string", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();

    if (typeof updateCommand.builder === "function") {
      updateCommand.builder(mockYargs);
      expect(capturedPositionals["source"]).toEqual(
        expect.objectContaining({
          type: "string",
        }),
      );
      // Source is OPTIONAL for update (unlike install)
      expect(capturedPositionals["source"]?.demandOption).toBeUndefined();
    }
  });

  it("includes description for source positional", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();

    if (typeof updateCommand.builder === "function") {
      updateCommand.builder(mockYargs);
      expect(capturedPositionals["source"]?.describe).toBeDefined();
    }
  });
});

describe("skills update command options", () => {
  it("defines --scope option with string type and default project", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof updateCommand.builder === "function") {
      updateCommand.builder(mockYargs);
      expect(capturedOptions["scope"]).toEqual(
        expect.objectContaining({
          type: "string",
          default: "project",
        }),
      );
    }
  });

  it("defines --agent option as string array with empty default", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof updateCommand.builder === "function") {
      updateCommand.builder(mockYargs);
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

    if (typeof updateCommand.builder === "function") {
      updateCommand.builder(mockYargs);
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

    if (typeof updateCommand.builder === "function") {
      updateCommand.builder(mockYargs);
      expect(capturedOptions["yes"]).toEqual(
        expect.objectContaining({
          type: "boolean",
          alias: "y",
          default: false,
        }),
      );
    }
  });

  it("defines --force option with boolean type, alias, and default false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof updateCommand.builder === "function") {
      updateCommand.builder(mockYargs);
      expect(capturedOptions["force"]).toEqual(
        expect.objectContaining({
          type: "boolean",
          alias: "f",
          default: false,
        }),
      );
    }
  });

  it("defines --preview option with boolean type and default false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof updateCommand.builder === "function") {
      updateCommand.builder(mockYargs);
      expect(capturedOptions["preview"]).toEqual(
        expect.objectContaining({
          type: "boolean",
          default: false,
        }),
      );
    }
  });

  it("defines --non-interactive option with boolean type and no default", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof updateCommand.builder === "function") {
      updateCommand.builder(mockYargs);
      expect(capturedOptions["non-interactive"]).toEqual(
        expect.objectContaining({
          type: "boolean",
        }),
      );
      expect(capturedOptions["non-interactive"]?.default).toBeUndefined();
    }
  });

  it("includes description for --scope option", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof updateCommand.builder === "function") {
      updateCommand.builder(mockYargs);
      expect(capturedOptions["scope"]?.describe).toBeDefined();
      expect(capturedOptions["scope"]?.describe).toContain("Configuration scope");
    }
  });

  it("includes description for --skill option", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof updateCommand.builder === "function") {
      updateCommand.builder(mockYargs);
      expect(capturedOptions["skill"]?.describe).toBeDefined();
      expect(capturedOptions["skill"]?.describe).toContain("skill");
    }
  });

  it("includes description for --yes option", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof updateCommand.builder === "function") {
      updateCommand.builder(mockYargs);
      expect(capturedOptions["yes"]?.describe).toBeDefined();
      expect(capturedOptions["yes"]?.describe).toContain("prompts");
    }
  });

  it("includes description for --non-interactive option", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof updateCommand.builder === "function") {
      updateCommand.builder(mockYargs);
      expect(capturedOptions["non-interactive"]?.describe).toBeDefined();
    }
  });
});

describe("skills update command examples", () => {
  it("registers usage examples", () => {
    // Build mock object - methods return self for chaining
    const mock = {
      positional: vi.fn().mockReturnThis(),
      option: vi.fn().mockReturnThis(),
      example: vi.fn().mockReturnThis(),
    };

    if (typeof updateCommand.builder === "function") {
      // Cast once at the boundary - yargs types are too complex for mocks
      updateCommand.builder(mock as unknown as Argv);
      expect(mock.example).toHaveBeenCalled();
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
describe("skills update command parser", () => {
  /**
   * Creates a yargs parser configured for testing.
   * - Uses updateCommand.builder for option definitions but no handler
   * - exitProcess(false): Prevents process.exit() on errors
   * - fail(false): Throws errors instead of printing to stderr
   */
  const createParser = () =>
    yargs()
      .command({
        command: updateCommand.command,
        describe: updateCommand.describe,
        builder: updateCommand.builder,
        handler: () => {}, // No-op handler - we only want to test parsing
      })
      .exitProcess(false)
      .fail(false);

  it("accepts no source (source is optional)", async () => {
    const argv = await createParser().parse(["update"]);

    expect(argv["source"]).toBeUndefined();
  });

  it("parses source positional argument when provided", async () => {
    const argv = await createParser().parse(["update", "owner/repo"]);

    expect(argv["source"]).toBe("owner/repo");
  });

  it("parses with default values when no options provided", async () => {
    const argv = await createParser().parse(["update"]);

    expect(argv["scope"]).toBe("project");
    expect(argv["yes"]).toBe(false);
    expect(argv["force"]).toBe(false);
    expect(argv["preview"]).toBe(false);
    expect(argv["agent"]).toEqual([]);
    expect(argv["skill"]).toEqual([]);
  });

  it("parses --scope user", async () => {
    const argv = await createParser().parse(["update", "--scope", "user"]);

    expect(argv["scope"]).toBe("user");
  });

  it("parses --yes flag", async () => {
    const argv = await createParser().parse(["update", "--yes"]);

    expect(argv["yes"]).toBe(true);
  });

  it("parses -y alias for --yes", async () => {
    const argv = await createParser().parse(["update", "-y"]);

    expect(argv["yes"]).toBe(true);
  });

  it("parses --force flag", async () => {
    const argv = await createParser().parse(["update", "--force"]);

    expect(argv["force"]).toBe(true);
  });

  it("parses -f alias for --force", async () => {
    const argv = await createParser().parse(["update", "-f"]);

    expect(argv["force"]).toBe(true);
  });

  it("parses --preview flag", async () => {
    const argv = await createParser().parse(["update", "--preview"]);

    expect(argv["preview"]).toBe(true);
  });

  it("parses single --skill value", async () => {
    const argv = await createParser().parse(["update", "--skill", "pr-review"]);

    expect(argv["skill"]).toEqual(["pr-review"]);
  });

  it("parses multiple --skill values", async () => {
    const argv = await createParser().parse([
      "update",
      "--skill",
      "pr-review",
      "--skill",
      "commit",
    ]);

    expect(argv["skill"]).toEqual(["pr-review", "commit"]);
  });

  it("parses single --agent value", async () => {
    const argv = await createParser().parse(["update", "--agent", "claude-code"]);

    expect(argv["agent"]).toEqual(["claude-code"]);
  });

  it("parses combination of source and flags", async () => {
    const argv = await createParser().parse([
      "update",
      "owner/repo",
      "--scope",
      "user",
      "-y",
      "-f",
      "--skill",
      "pr-review",
    ]);

    expect(argv["source"]).toBe("owner/repo");
    expect(argv["scope"]).toBe("user");
    expect(argv["yes"]).toBe(true);
    expect(argv["force"]).toBe(true);
    expect(argv["skill"]).toEqual(["pr-review"]);
  });
});
