/**
 * Unit tests for the skills disable command yargs definition.
 *
 * Tests verify command description, positional arguments, options, and defaults.
 * Handler logic is tested separately in handler.test.ts.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it, vi } from "vitest";
import yargs, { type Argv, type Options, type PositionalOptions } from "yargs";
import { disableCommand } from "./command.js";

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

describe("skills disable command", () => {
  const createParser = () => yargs().command(disableCommand).exitProcess(false);

  it("registers with correct description", () => {
    expect(disableCommand.describe).toBe("Disable a skill without uninstalling it");
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("disable <name>");
    expect(helpOutput).toContain("Disable");
  });
});

describe("skills disable command positional", () => {
  it("defines name positional argument as required string", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();

    if (typeof disableCommand.builder === "function") {
      disableCommand.builder(mockYargs);
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

    if (typeof disableCommand.builder === "function") {
      disableCommand.builder(mockYargs);
      expect(capturedPositionals["name"]?.describe).toBeDefined();
      expect(capturedPositionals["name"]?.describe).toContain("skill");
    }
  });
});

describe("skills disable command options", () => {
  it("defines --scope option with string type and default project", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof disableCommand.builder === "function") {
      disableCommand.builder(mockYargs);
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

    if (typeof disableCommand.builder === "function") {
      disableCommand.builder(mockYargs);
      expect(capturedOptions["yes"]).toBeUndefined();
    }
  });

  it("does not define --preview option (global flag)", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof disableCommand.builder === "function") {
      disableCommand.builder(mockYargs);
      expect(capturedOptions["preview"]).toBeUndefined();
    }
  });

  it("does not define --non-interactive option (global flag)", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof disableCommand.builder === "function") {
      disableCommand.builder(mockYargs);
      expect(capturedOptions["non-interactive"]).toBeUndefined();
    }
  });
});

describe("skills disable command parser", () => {
  const createParser = () =>
    yargs()
      .command({
        command: disableCommand.command,
        describe: disableCommand.describe,
        builder: disableCommand.builder,
        handler: () => {},
      })
      .exitProcess(false)
      .fail(false);

  it("requires name positional argument", async () => {
    let error: Error | null = null;
    try {
      await createParser().parse(["disable"]);
    } catch (e) {
      error = e as Error;
    }
    expect(error).not.toBeNull();
    expect(error?.message).toContain("Not enough non-option arguments");
  });

  it("parses name positional argument", async () => {
    const argv = await createParser().parse(["disable", "my-skill"]);
    expect(argv["name"]).toBe("my-skill");
  });

  it("parses with default values when no options provided", async () => {
    const argv = await createParser().parse(["disable", "my-skill"]);
    expect(argv["scope"]).toBe("project");
  });

  it("parses --scope user", async () => {
    const argv = await createParser().parse(["disable", "my-skill", "--scope", "user"]);
    expect(argv["name"]).toBe("my-skill");
    expect(argv["scope"]).toBe("user");
  });
});
