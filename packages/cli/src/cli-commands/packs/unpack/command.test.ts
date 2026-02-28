/**
 * Unit tests for the packs unpack command yargs definition.
 *
 * Tests verify command description, positional arguments, options, and defaults.
 * Handler logic is tested separately in handler.test.ts.
 */

import { describe, expect, it, vi } from "vitest";
import yargs, { type Argv, type Options, type PositionalOptions } from "yargs";
import { unpackCommand } from "./command.js";

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

describe("packs unpack command", () => {
  const createParser = () => yargs().command(unpackCommand).exitProcess(false);

  it("registers with correct description", () => {
    expect(unpackCommand.describe).toBe("Eject pack into individual entries");
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("unpack <name>");
    expect(helpOutput).toContain("Eject pack into individual entries");
  });

  it("requires name positional argument", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();
    (unpackCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedPositionals["name"]).toBeDefined();
    expect(capturedPositionals["name"]?.type).toBe("string");
    expect(capturedPositionals["name"]?.demandOption).toBe(true);
  });

  it("does not define per-command --yes, --preview, or --non-interactive (now global)", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (unpackCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["yes"]).toBeUndefined();
    expect(capturedOptions["preview"]).toBeUndefined();
    expect(capturedOptions["non-interactive"]).toBeUndefined();
  });

  it("supports --strict-agent-sync for MCP promotion policy", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (unpackCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["strict-agent-sync"]).toBeDefined();
    expect(capturedOptions["strict-agent-sync"]?.type).toBe("boolean");
    expect(capturedOptions["strict-agent-sync"]?.default).toBe(false);
  });
});
