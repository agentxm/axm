/**
 * Unit tests for the skills add command yargs definition.
 *
 * Tests verify command description, positional arguments, options, and defaults.
 * Handler logic is tested separately in handler.test.ts.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it, vi } from "vitest";
import yargs from "yargs";
import { addCommand } from "./command.js";

describe("skills add command", () => {
  const createParser = () => yargs().command(addCommand).exitProcess(false);

  it("registers with correct description", () => {
    expect(addCommand.describe).toBe("Install skills from a GitHub repo, local path, or URL");
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("add <source>");
    expect(helpOutput).toContain("Install skills");
  });
});

describe("skills add command positional", () => {
  /**
   * Creates a mock yargs instance that records positional() and option() calls.
   * Returns the mock along with helpers to retrieve captured options.
   */
  const createCapturingMock = () => {
    const capturedPositionals: Record<string, unknown> = {};
    const capturedOptions: Record<string, unknown> = {};
    const mockYargs = {
      positional: vi.fn((name: string, config: unknown) => {
        capturedPositionals[name] = config;
        return mockYargs;
      }),
      option: vi.fn((name: string, config: unknown) => {
        capturedOptions[name] = config;
        return mockYargs;
      }),
      example: vi.fn().mockReturnThis(),
    };
    return { mockYargs, capturedPositionals, capturedOptions };
  };

  it("defines source positional argument as required string", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();

    if (typeof addCommand.builder === "function") {
      addCommand.builder(mockYargs as any);
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

    if (typeof addCommand.builder === "function") {
      addCommand.builder(mockYargs as any);
      expect((capturedPositionals["source"] as any).describe).toBeDefined();
      expect((capturedPositionals["source"] as any).describe).toContain("GitHub");
    }
  });
});

describe("skills add command options", () => {
  /**
   * Creates a mock yargs instance that records positional() and option() calls.
   * Returns the mock along with helpers to retrieve captured options.
   */
  const createCapturingMock = () => {
    const capturedPositionals: Record<string, unknown> = {};
    const capturedOptions: Record<string, unknown> = {};
    const mockYargs = {
      positional: vi.fn((name: string, config: unknown) => {
        capturedPositionals[name] = config;
        return mockYargs;
      }),
      option: vi.fn((name: string, config: unknown) => {
        capturedOptions[name] = config;
        return mockYargs;
      }),
      example: vi.fn().mockReturnThis(),
    };
    return { mockYargs, capturedPositionals, capturedOptions };
  };

  it("defines --global option with boolean type and default false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof addCommand.builder === "function") {
      addCommand.builder(mockYargs as any);
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

    if (typeof addCommand.builder === "function") {
      addCommand.builder(mockYargs as any);
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

    if (typeof addCommand.builder === "function") {
      addCommand.builder(mockYargs as any);
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

    if (typeof addCommand.builder === "function") {
      addCommand.builder(mockYargs as any);
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

    if (typeof addCommand.builder === "function") {
      addCommand.builder(mockYargs as any);
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

    if (typeof addCommand.builder === "function") {
      addCommand.builder(mockYargs as any);
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

    if (typeof addCommand.builder === "function") {
      addCommand.builder(mockYargs as any);
      expect((capturedOptions["global"] as any).describe).toBeDefined();
      expect((capturedOptions["global"] as any).describe).toContain("global");
    }
  });

  it("includes description for --agent option", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof addCommand.builder === "function") {
      addCommand.builder(mockYargs as any);
      expect((capturedOptions["agent"] as any).describe).toBeDefined();
      expect((capturedOptions["agent"] as any).describe).toContain("agent");
    }
  });

  it("includes description for --skill option", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof addCommand.builder === "function") {
      addCommand.builder(mockYargs as any);
      expect((capturedOptions["skill"] as any).describe).toBeDefined();
      expect((capturedOptions["skill"] as any).describe).toContain("skill");
    }
  });

  it("includes description for --yes option", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof addCommand.builder === "function") {
      addCommand.builder(mockYargs as any);
      expect((capturedOptions["yes"] as any).describe).toBeDefined();
      expect((capturedOptions["yes"] as any).describe).toContain("prompts");
    }
  });

  it("includes description for --list option", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof addCommand.builder === "function") {
      addCommand.builder(mockYargs as any);
      expect((capturedOptions["list"] as any).describe).toBeDefined();
      expect((capturedOptions["list"] as any).describe).toContain("List");
    }
  });

  it("includes description for --all option", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof addCommand.builder === "function") {
      addCommand.builder(mockYargs as any);
      expect((capturedOptions["all"] as any).describe).toBeDefined();
      expect((capturedOptions["all"] as any).describe).toContain("all");
    }
  });
});

describe("skills add command examples", () => {
  it("registers usage examples", () => {
    const mockYargs = {
      positional: vi.fn().mockReturnThis(),
      option: vi.fn().mockReturnThis(),
      example: vi.fn().mockReturnThis(),
    };

    if (typeof addCommand.builder === "function") {
      addCommand.builder(mockYargs as any);
      expect(mockYargs.example).toHaveBeenCalled();
      // Verify multiple examples are provided for this complex command
      expect(mockYargs.example.mock.calls.length).toBeGreaterThan(3);
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
describe("skills add command parser", () => {
  /**
   * Creates a yargs parser configured for testing.
   * - Uses addCommand.builder for option definitions but no handler
   * - exitProcess(false): Prevents process.exit() on errors
   * - fail(false): Throws errors instead of printing to stderr
   */
  const createParser = () =>
    yargs()
      .command({
        command: addCommand.command,
        describe: addCommand.describe,
        builder: addCommand.builder,
        handler: () => {}, // No-op handler - we only want to test parsing
      })
      .exitProcess(false)
      .fail(false);

  it("requires source positional argument", async () => {
    // yargs throws synchronously when required positional is missing with fail(false)
    // We wrap in a try/catch to verify the error
    let error: Error | null = null;
    try {
      await createParser().parse(["add"]);
    } catch (e) {
      error = e as Error;
    }
    expect(error).not.toBeNull();
    expect(error?.message).toContain("Not enough non-option arguments");
  });

  it("parses source positional argument", async () => {
    const argv = await createParser().parse(["add", "owner/repo"]);

    expect(argv["source"]).toBe("owner/repo");
  });

  it("parses with default values when no options provided", async () => {
    const argv = await createParser().parse(["add", "owner/repo"]);

    expect(argv["global"]).toBe(false);
    expect(argv["yes"]).toBe(false);
    expect(argv["list"]).toBe(false);
    expect(argv["all"]).toBe(false);
    expect(argv["agent"]).toEqual([]);
    expect(argv["skill"]).toEqual([]);
  });

  it("parses --global flag", async () => {
    const argv = await createParser().parse(["add", "owner/repo", "--global"]);

    expect(argv["global"]).toBe(true);
  });

  it("parses --yes flag", async () => {
    const argv = await createParser().parse(["add", "owner/repo", "--yes"]);

    expect(argv["yes"]).toBe(true);
  });

  it("parses -y alias for --yes", async () => {
    const argv = await createParser().parse(["add", "owner/repo", "-y"]);

    expect(argv["yes"]).toBe(true);
  });

  it("parses --list flag", async () => {
    const argv = await createParser().parse(["add", "owner/repo", "--list"]);

    expect(argv["list"]).toBe(true);
  });

  it("parses -l alias for --list", async () => {
    const argv = await createParser().parse(["add", "owner/repo", "-l"]);

    expect(argv["list"]).toBe(true);
  });

  it("parses --all flag", async () => {
    const argv = await createParser().parse(["add", "owner/repo", "--all"]);

    expect(argv["all"]).toBe(true);
  });

  it("parses single --agent value", async () => {
    const argv = await createParser().parse(["add", "owner/repo", "--agent", "claude-code"]);

    expect(argv["agent"]).toEqual(["claude-code"]);
  });

  it("parses multiple --agent values", async () => {
    const argv = await createParser().parse([
      "add",
      "owner/repo",
      "--agent",
      "claude-code",
      "--agent",
      "cursor",
    ]);

    expect(argv["agent"]).toEqual(["claude-code", "cursor"]);
  });

  it("parses single --skill value", async () => {
    const argv = await createParser().parse(["add", "owner/repo", "--skill", "pr-review"]);

    expect(argv["skill"]).toEqual(["pr-review"]);
  });

  it("parses multiple --skill values", async () => {
    const argv = await createParser().parse([
      "add",
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
      "add",
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
