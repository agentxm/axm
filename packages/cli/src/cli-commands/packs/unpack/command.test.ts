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

  it("defines --yes flag with default false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (unpackCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["yes"]).toBeDefined();
    expect(capturedOptions["yes"]?.type).toBe("boolean");
    expect(capturedOptions["yes"]?.default).toBe(false);
  });

  it("defines --preview flag with default false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (unpackCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["preview"]).toBeDefined();
    expect(capturedOptions["preview"]?.type).toBe("boolean");
    expect(capturedOptions["preview"]?.default).toBe(false);
  });

  it("defines --non-interactive flag as optional boolean", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (unpackCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["non-interactive"]).toBeDefined();
    expect(capturedOptions["non-interactive"]?.type).toBe("boolean");
  });
});
