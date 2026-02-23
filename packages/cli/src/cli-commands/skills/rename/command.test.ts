/**
 * Unit tests for the skills rename command yargs definition.
 *
 * Tests verify command description, positional arguments, options, and defaults.
 * Handler logic is tested separately in handler.test.ts.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it, vi } from "vitest";
import yargs, { type Argv, type Options, type PositionalOptions } from "yargs";
import { renameCommand } from "./command.js";

type CapturedOptions = Record<string, Options>;
type CapturedPositionals = Record<string, PositionalOptions>;

const createCapturingMock = () => {
  const capturedPositionals: CapturedPositionals = {};
  const capturedOptions: CapturedOptions = {};

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

  return { mockYargs: mock as unknown as Argv, capturedPositionals, capturedOptions };
};

describe("skills rename command", () => {
  const createParser = () => yargs().command(renameCommand).exitProcess(false);

  it("registers with correct description", () => {
    expect(renameCommand.describe).toBe("Rename a skill");
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("rename <old-name> <new-name>");
    expect(helpOutput).toContain("Rename");
  });
});

describe("skills rename command positionals", () => {
  it("defines old-name positional argument as required string", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();

    if (typeof renameCommand.builder === "function") {
      renameCommand.builder(mockYargs);
      expect(capturedPositionals["old-name"]).toEqual(
        expect.objectContaining({
          type: "string",
          demandOption: true,
        }),
      );
    }
  });

  it("defines new-name positional argument as required string", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();

    if (typeof renameCommand.builder === "function") {
      renameCommand.builder(mockYargs);
      expect(capturedPositionals["new-name"]).toEqual(
        expect.objectContaining({
          type: "string",
          demandOption: true,
        }),
      );
    }
  });

  it("includes description for old-name positional", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();

    if (typeof renameCommand.builder === "function") {
      renameCommand.builder(mockYargs);
      expect(capturedPositionals["old-name"]?.describe).toBeDefined();
    }
  });

  it("includes description for new-name positional", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();

    if (typeof renameCommand.builder === "function") {
      renameCommand.builder(mockYargs);
      expect(capturedPositionals["new-name"]?.describe).toBeDefined();
    }
  });
});

describe("skills rename command options", () => {
  it("defines --scope option with string type and default project", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof renameCommand.builder === "function") {
      renameCommand.builder(mockYargs);
      expect(capturedOptions["scope"]).toEqual(
        expect.objectContaining({
          type: "string",
          default: "project",
        }),
      );
    }
  });

  it("defines --yes option with boolean type, alias, and default false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof renameCommand.builder === "function") {
      renameCommand.builder(mockYargs);
      expect(capturedOptions["yes"]).toEqual(
        expect.objectContaining({
          type: "boolean",
          alias: "y",
          default: false,
        }),
      );
    }
  });

  it("defines --preview option with boolean type and default false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof renameCommand.builder === "function") {
      renameCommand.builder(mockYargs);
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

    if (typeof renameCommand.builder === "function") {
      renameCommand.builder(mockYargs);
      expect(capturedOptions["non-interactive"]).toEqual(
        expect.objectContaining({
          type: "boolean",
        }),
      );
      expect(capturedOptions["non-interactive"]?.default).toBeUndefined();
    }
  });
});

describe("skills rename command parser", () => {
  const createParser = () =>
    yargs()
      .command({
        command: renameCommand.command,
        describe: renameCommand.describe,
        builder: renameCommand.builder,
        handler: () => {},
      })
      .exitProcess(false)
      .fail(false);

  it("requires both positional arguments", async () => {
    let error: Error | null = null;
    try {
      await createParser().parse(["rename"]);
    } catch (e) {
      error = e as Error;
    }
    expect(error).not.toBeNull();
    expect(error?.message).toContain("Not enough non-option arguments");
  });

  it("requires new-name positional argument", async () => {
    let error: Error | null = null;
    try {
      await createParser().parse(["rename", "old-skill"]);
    } catch (e) {
      error = e as Error;
    }
    expect(error).not.toBeNull();
    expect(error?.message).toContain("Not enough non-option arguments");
  });

  it("parses both positional arguments", async () => {
    const argv = await createParser().parse(["rename", "old-skill", "new-skill"]);
    expect(argv["old-name"]).toBe("old-skill");
    expect(argv["new-name"]).toBe("new-skill");
  });

  it("parses with default values when no options provided", async () => {
    const argv = await createParser().parse(["rename", "old-skill", "new-skill"]);
    expect(argv["scope"]).toBe("project");
    expect(argv["yes"]).toBe(false);
    expect(argv["preview"]).toBe(false);
  });

  it("parses --scope user", async () => {
    const argv = await createParser().parse([
      "rename",
      "old-skill",
      "new-skill",
      "--scope",
      "user",
    ]);
    expect(argv["scope"]).toBe("user");
  });

  it("parses --yes flag", async () => {
    const argv = await createParser().parse(["rename", "old-skill", "new-skill", "--yes"]);
    expect(argv["yes"]).toBe(true);
  });

  it("parses -y alias for --yes", async () => {
    const argv = await createParser().parse(["rename", "old-skill", "new-skill", "-y"]);
    expect(argv["yes"]).toBe(true);
  });

  it("parses --preview flag", async () => {
    const argv = await createParser().parse(["rename", "old-skill", "new-skill", "--preview"]);
    expect(argv["preview"]).toBe(true);
  });

  it("parses combination of flags", async () => {
    const argv = await createParser().parse([
      "rename",
      "old-skill",
      "new-skill",
      "--scope",
      "user",
      "-y",
      "--preview",
    ]);
    expect(argv["old-name"]).toBe("old-skill");
    expect(argv["new-name"]).toBe("new-skill");
    expect(argv["scope"]).toBe("user");
    expect(argv["yes"]).toBe(true);
    expect(argv["preview"]).toBe(true);
  });
});
