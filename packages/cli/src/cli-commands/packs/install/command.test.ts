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
  it("defines --global option with boolean type and default false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof installPackCommand.builder === "function") {
      installPackCommand.builder(mockYargs);
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

    if (typeof installPackCommand.builder === "function") {
      installPackCommand.builder(mockYargs);
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

    if (typeof installPackCommand.builder === "function") {
      installPackCommand.builder(mockYargs);
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

    if (typeof installPackCommand.builder === "function") {
      installPackCommand.builder(mockYargs);
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

    if (typeof installPackCommand.builder === "function") {
      installPackCommand.builder(mockYargs);
      expect(capturedOptions["non-interactive"]).toEqual(
        expect.objectContaining({
          type: "boolean",
        }),
      );
      expect(capturedOptions["non-interactive"]?.default).toBeUndefined();
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
    const argv = await createParser().parse(["install", "@acme/my-pack"]);
    expect(argv["source"]).toBe("@acme/my-pack");
  });

  it("parses with default values when no options provided", async () => {
    const argv = await createParser().parse(["install", "@acme/my-pack"]);
    expect(argv["global"]).toBe(false);
    expect(argv["yes"]).toBe(false);
    expect(argv["force"]).toBe(false);
    expect(argv["preview"]).toBe(false);
  });

  it("parses --global flag", async () => {
    const argv = await createParser().parse(["install", "@acme/my-pack", "--global"]);
    expect(argv["global"]).toBe(true);
  });

  it("parses --yes flag", async () => {
    const argv = await createParser().parse(["install", "@acme/my-pack", "--yes"]);
    expect(argv["yes"]).toBe(true);
  });

  it("parses -y alias for --yes", async () => {
    const argv = await createParser().parse(["install", "@acme/my-pack", "-y"]);
    expect(argv["yes"]).toBe(true);
  });

  it("parses --force flag", async () => {
    const argv = await createParser().parse(["install", "@acme/my-pack", "--force"]);
    expect(argv["force"]).toBe(true);
  });

  it("parses -f alias for --force", async () => {
    const argv = await createParser().parse(["install", "@acme/my-pack", "-f"]);
    expect(argv["force"]).toBe(true);
  });

  it("parses --preview flag", async () => {
    const argv = await createParser().parse(["install", "@acme/my-pack", "--preview"]);
    expect(argv["preview"]).toBe(true);
  });

  it("parses combination of flags", async () => {
    const argv = await createParser().parse([
      "install",
      "@acme/my-pack",
      "--global",
      "-y",
      "-f",
      "--preview",
    ]);
    expect(argv["source"]).toBe("@acme/my-pack");
    expect(argv["global"]).toBe(true);
    expect(argv["yes"]).toBe(true);
    expect(argv["force"]).toBe(true);
    expect(argv["preview"]).toBe(true);
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
