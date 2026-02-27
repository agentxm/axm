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
  it("defines --scope option with string type and default project", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof enableCommand.builder === "function") {
      enableCommand.builder(mockYargs);
      expect(capturedOptions["scope"]).toEqual(
        expect.objectContaining({
          type: "string",
          default: "project",
        }),
      );
    }
  });

  it("does not define --yes option (global flag)", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof enableCommand.builder === "function") {
      enableCommand.builder(mockYargs);
      expect(capturedOptions["yes"]).toBeUndefined();
    }
  });

  it("does not define --preview option (global flag)", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof enableCommand.builder === "function") {
      enableCommand.builder(mockYargs);
      expect(capturedOptions["preview"]).toBeUndefined();
    }
  });

  it("does not define --non-interactive option (global flag)", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof enableCommand.builder === "function") {
      enableCommand.builder(mockYargs);
      expect(capturedOptions["non-interactive"]).toBeUndefined();
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
    expect(argv["scope"]).toBe("project");
  });

  it("parses --scope user", async () => {
    const argv = await createParser().parse(["enable", "my-skill", "--scope", "user"]);
    expect(argv["name"]).toBe("my-skill");
    expect(argv["scope"]).toBe("user");
  });
});
