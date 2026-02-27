/**
 * Unit tests for the packs install command yargs definition.
 *
 * Tests verify command description, positional arguments, options, and defaults.
 * Handler logic is tested separately in handler.test.ts.
 */

import { describe, expect, it, vi } from "vitest";
import yargs, { type Argv, type Options, type PositionalOptions } from "yargs";
import { installPackCommand } from "./command.js";

/**
 * Type for captured yargs option configurations.
 */
type CapturedOptions = Record<string, Options>;
type CapturedPositionals = Record<string, PositionalOptions>;

/**
 * Creates a mock yargs instance that records positional() and option() calls.
 */
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

describe("packs install command", () => {
  const createParser = () => yargs().command(installPackCommand).exitProcess(false);

  it("registers with correct description", () => {
    expect(installPackCommand.describe).toBe("Install a pack and its extensions from a registry");
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("install <source>");
    expect(helpOutput).toContain("Install a pack");
  });
});

describe("packs install command positional", () => {
  it("defines source positional argument as required string", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();

    if (typeof installPackCommand.builder === "function") {
      installPackCommand.builder(mockYargs);
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

    if (typeof installPackCommand.builder === "function") {
      installPackCommand.builder(mockYargs);
      expect(capturedPositionals["source"]?.describe).toBeDefined();
      expect(capturedPositionals["source"]?.describe).toContain("Registry");
    }
  });
});

describe("packs install command options", () => {
  it("defines --scope option with string type and default project", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installPackCommand.builder === "function") {
      installPackCommand.builder(mockYargs);
      expect(capturedOptions["scope"]).toEqual(
        expect.objectContaining({
          type: "string",
          default: "project",
        }),
      );
    }
  });

  it("does not define per-command --yes, --force, --preview, or --non-interactive (now global)", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installPackCommand.builder === "function") {
      installPackCommand.builder(mockYargs);
      expect(capturedOptions["yes"]).toBeUndefined();
      expect(capturedOptions["force"]).toBeUndefined();
      expect(capturedOptions["preview"]).toBeUndefined();
      expect(capturedOptions["non-interactive"]).toBeUndefined();
    }
  });
});

describe("packs install command parser", () => {
  const createParser = () =>
    yargs()
      .command({
        command: installPackCommand.command,
        describe: installPackCommand.describe,
        builder: installPackCommand.builder,
        handler: () => {},
      })
      .exitProcess(false)
      .fail(false);

  it("requires source positional argument", async () => {
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
    const argv = await createParser().parse(["install", "@acme/packs/my-pack"]);
    expect(argv["source"]).toBe("@acme/packs/my-pack");
  });

  it("parses with default values when no options provided", async () => {
    const argv = await createParser().parse(["install", "@acme/packs/my-pack"]);
    expect(argv["scope"]).toBe("project");
  });

  it("parses --scope user", async () => {
    const argv = await createParser().parse(["install", "@acme/packs/my-pack", "--scope", "user"]);
    expect(argv["scope"]).toBe("user");
  });

  it("parses versioned source", async () => {
    const argv = await createParser().parse(["install", "@acme/my-pack@^2.0.0"]);
    expect(argv["source"]).toBe("@acme/my-pack@^2.0.0");
  });
});

describe("packs install command examples", () => {
  it("registers usage examples", () => {
    const mock = {
      positional: vi.fn().mockReturnThis(),
      option: vi.fn().mockReturnThis(),
      example: vi.fn().mockReturnThis(),
    };

    if (typeof installPackCommand.builder === "function") {
      installPackCommand.builder(mock as unknown as Argv);
      expect(mock.example).toHaveBeenCalled();
      expect(mock.example.mock.calls.length).toBeGreaterThanOrEqual(3);
    }
  });
});
