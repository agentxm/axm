/**
 * Unit tests for the skills enable command yargs definition.
 *
 * Tests verify command description, positional arguments, options, and defaults.
 * Handler logic is tested separately in handler.test.ts.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it, vi } from "vitest";
import yargs, { type Argv, type Options, type PositionalOptions } from "yargs";
import { enableCommand } from "./command.js";

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

describe("skills enable command", () => {
  const createParser = () => yargs().command(enableCommand).exitProcess(false);

  it("registers with correct description", () => {
    expect(enableCommand.describe).toBe("Enable a previously disabled skill");
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("enable <name>");
    expect(helpOutput).toContain("Enable");
  });
});

describe("skills enable command positional", () => {
  it("defines name positional argument as required string", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();

    if (typeof enableCommand.builder === "function") {
      enableCommand.builder(mockYargs);
      expect(capturedPositionals["name"]).toEqual(
        expect.objectContaining({
          type: "string",
          demandOption: true,
        }),
      );
    }
  });

  it("includes description for name positional", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();

    if (typeof enableCommand.builder === "function") {
      enableCommand.builder(mockYargs);
      expect(capturedPositionals["name"]?.describe).toBeDefined();
      expect(capturedPositionals["name"]?.describe).toContain("skill");
    }
  });
});

describe("skills enable command options", () => {
  it("defines --global option with boolean type and default false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof enableCommand.builder === "function") {
      enableCommand.builder(mockYargs);
      expect(capturedOptions["global"]).toEqual(
        expect.objectContaining({
          type: "boolean",
          default: false,
        }),
      );
    }
  });

  it("defines --yes option with boolean type, alias, and default false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof enableCommand.builder === "function") {
      enableCommand.builder(mockYargs);
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

    if (typeof enableCommand.builder === "function") {
      enableCommand.builder(mockYargs);
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

    if (typeof enableCommand.builder === "function") {
      enableCommand.builder(mockYargs);
      expect(capturedOptions["non-interactive"]).toEqual(
        expect.objectContaining({
          type: "boolean",
        }),
      );
      expect(capturedOptions["non-interactive"]?.default).toBeUndefined();
    }
  });
});

describe("skills enable command parser", () => {
  const createParser = () =>
    yargs()
      .command({
        command: enableCommand.command,
        describe: enableCommand.describe,
        builder: enableCommand.builder,
        handler: () => {},
      })
      .exitProcess(false)
      .fail(false);

  it("requires name positional argument", async () => {
    let error: Error | null = null;
    try {
      await createParser().parse(["enable"]);
    } catch (e) {
      error = e as Error;
    }
    expect(error).not.toBeNull();
    expect(error?.message).toContain("Not enough non-option arguments");
  });

  it("parses name positional argument", async () => {
    const argv = await createParser().parse(["enable", "my-skill"]);
    expect(argv["name"]).toBe("my-skill");
  });

  it("parses with default values when no options provided", async () => {
    const argv = await createParser().parse(["enable", "my-skill"]);
    expect(argv["global"]).toBe(false);
    expect(argv["yes"]).toBe(false);
    expect(argv["preview"]).toBe(false);
  });

  it("parses --global flag", async () => {
    const argv = await createParser().parse(["enable", "my-skill", "--global"]);
    expect(argv["global"]).toBe(true);
  });

  it("parses --yes flag", async () => {
    const argv = await createParser().parse(["enable", "my-skill", "--yes"]);
    expect(argv["yes"]).toBe(true);
  });

  it("parses -y alias for --yes", async () => {
    const argv = await createParser().parse(["enable", "my-skill", "-y"]);
    expect(argv["yes"]).toBe(true);
  });

  it("parses --preview flag", async () => {
    const argv = await createParser().parse(["enable", "my-skill", "--preview"]);
    expect(argv["preview"]).toBe(true);
  });

  it("parses combination of flags", async () => {
    const argv = await createParser().parse(["enable", "my-skill", "--global", "-y", "--preview"]);
    expect(argv["name"]).toBe("my-skill");
    expect(argv["global"]).toBe(true);
    expect(argv["yes"]).toBe(true);
    expect(argv["preview"]).toBe(true);
  });
});
