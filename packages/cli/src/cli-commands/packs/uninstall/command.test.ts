/**
 * Unit tests for the packs uninstall command yargs definition.
 *
 * Tests verify command description, positional arguments, options, and defaults.
 * Handler logic is tested separately in handler.test.ts.
 */

import { describe, expect, it, vi } from "vitest";
import yargs, { type Argv, type Options, type PositionalOptions } from "yargs";
import { uninstallPackCommand } from "./command.js";

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

describe("packs uninstall command", () => {
  const createParser = () => yargs().command(uninstallPackCommand).exitProcess(false);

  it("registers with correct description", () => {
    expect(uninstallPackCommand.describe).toBe("Uninstall a pack");
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("uninstall <name>");
    expect(helpOutput).toContain("Uninstall a pack");
  });
});

describe("packs uninstall command positional", () => {
  it("defines name positional argument as required string", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();

    if (typeof uninstallPackCommand.builder === "function") {
      uninstallPackCommand.builder(mockYargs);
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

    if (typeof uninstallPackCommand.builder === "function") {
      uninstallPackCommand.builder(mockYargs);
      expect(capturedPositionals["name"]?.describe).toBeDefined();
      expect(capturedPositionals["name"]?.describe).toContain("pack");
    }
  });
});

describe("packs uninstall command options", () => {
  it("defines --yes option with boolean type, alias, and default false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();

    if (typeof uninstallPackCommand.builder === "function") {
      uninstallPackCommand.builder(mockYargs);
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

    if (typeof uninstallPackCommand.builder === "function") {
      uninstallPackCommand.builder(mockYargs);
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

    if (typeof uninstallPackCommand.builder === "function") {
      uninstallPackCommand.builder(mockYargs);
      expect(capturedOptions["non-interactive"]).toEqual(
        expect.objectContaining({
          type: "boolean",
        }),
      );
      expect(capturedOptions["non-interactive"]?.default).toBeUndefined();
    }
  });
});

describe("packs uninstall command parser", () => {
  const createParser = () =>
    yargs()
      .command({
        command: uninstallPackCommand.command,
        describe: uninstallPackCommand.describe,
        builder: uninstallPackCommand.builder,
        handler: () => {},
      })
      .exitProcess(false)
      .fail(false);

  it("requires name positional argument", async () => {
    let error: Error | null = null;
    try {
      await createParser().parse(["uninstall"]);
    } catch (e) {
      error = e as Error;
    }
    expect(error).not.toBeNull();
    expect(error?.message).toContain("Not enough non-option arguments");
  });

  it("parses name positional argument", async () => {
    const argv = await createParser().parse(["uninstall", "my-pack"]);
    expect(argv["name"]).toBe("my-pack");
  });

  it("parses with default values when no options provided", async () => {
    const argv = await createParser().parse(["uninstall", "my-pack"]);
    expect(argv["yes"]).toBe(false);
    expect(argv["preview"]).toBe(false);
  });

  it("parses --yes flag", async () => {
    const argv = await createParser().parse(["uninstall", "my-pack", "--yes"]);
    expect(argv["yes"]).toBe(true);
  });

  it("parses -y alias for --yes", async () => {
    const argv = await createParser().parse(["uninstall", "my-pack", "-y"]);
    expect(argv["yes"]).toBe(true);
  });

  it("parses --preview flag", async () => {
    const argv = await createParser().parse(["uninstall", "my-pack", "--preview"]);
    expect(argv["preview"]).toBe(true);
  });

  it("parses glob pattern", async () => {
    const argv = await createParser().parse(["uninstall", "acme-*"]);
    expect(argv["name"]).toBe("acme-*");
  });

  it("parses combination of flags", async () => {
    const argv = await createParser().parse(["uninstall", "my-pack", "-y", "--preview"]);
    expect(argv["name"]).toBe("my-pack");
    expect(argv["yes"]).toBe(true);
    expect(argv["preview"]).toBe(true);
  });
});

describe("packs uninstall command examples", () => {
  it("registers usage examples", () => {
    const mock = {
      positional: vi.fn().mockReturnThis(),
      option: vi.fn().mockReturnThis(),
      example: vi.fn().mockReturnThis(),
    };

    if (typeof uninstallPackCommand.builder === "function") {
      uninstallPackCommand.builder(mock as unknown as Argv);
      expect(mock.example).toHaveBeenCalled();
      expect(mock.example.mock.calls.length).toBeGreaterThanOrEqual(3);
    }
  });
});
