/**
 * Unit tests for the packs remove command yargs definition.
 */

import { describe, expect, it, vi } from "vitest";
import yargs, { type Argv, type Options, type PositionalOptions } from "yargs";
import { packsRemoveCommand } from "./command.js";

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

describe("packs remove command", () => {
  const createParser = () => yargs().command(packsRemoveCommand).exitProcess(false);

  it("registers with correct description", () => {
    expect(packsRemoveCommand.describe).toBe("Remove an extension from a pack manifest");
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("remove <pack> <extension>");
  });

  it("requires pack positional argument", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();
    (packsRemoveCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedPositionals["pack"]).toBeDefined();
    expect(capturedPositionals["pack"]?.type).toBe("string");
    expect(capturedPositionals["pack"]?.demandOption).toBe(true);
  });

  it("requires extension positional argument", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();
    (packsRemoveCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedPositionals["extension"]).toBeDefined();
    expect(capturedPositionals["extension"]?.type).toBe("string");
    expect(capturedPositionals["extension"]?.demandOption).toBe(true);
  });

  it("does not define per-command --yes, --preview, or --non-interactive (now global)", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (packsRemoveCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["yes"]).toBeUndefined();
    expect(capturedOptions["preview"]).toBeUndefined();
    expect(capturedOptions["non-interactive"]).toBeUndefined();
  });
});
