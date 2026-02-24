/**
 * Unit tests for the packs add command yargs definition.
 */

import { describe, expect, it, vi } from "vitest";
import yargs, { type Argv, type Options, type PositionalOptions } from "yargs";
import { packsAddCommand } from "./command.js";

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

describe("packs add command", () => {
  const createParser = () => yargs().command(packsAddCommand).exitProcess(false);

  it("registers with correct description", () => {
    expect(packsAddCommand.describe).toBe("Add an extension to a pack manifest");
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("add <pack> <extension>");
  });

  it("requires pack positional argument", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();
    (packsAddCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedPositionals["pack"]).toBeDefined();
    expect(capturedPositionals["pack"]?.type).toBe("string");
    expect(capturedPositionals["pack"]?.demandOption).toBe(true);
  });

  it("requires extension positional argument", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();
    (packsAddCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedPositionals["extension"]).toBeDefined();
    expect(capturedPositionals["extension"]?.type).toBe("string");
    expect(capturedPositionals["extension"]?.demandOption).toBe(true);
  });

  it("defines --yes flag with default false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (packsAddCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["yes"]).toBeDefined();
    expect(capturedOptions["yes"]?.type).toBe("boolean");
    expect(capturedOptions["yes"]?.default).toBe(false);
  });

  it("defines --preview flag with default false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (packsAddCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["preview"]).toBeDefined();
    expect(capturedOptions["preview"]?.type).toBe("boolean");
    expect(capturedOptions["preview"]?.default).toBe(false);
  });

  it("defines --non-interactive flag as optional boolean", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (packsAddCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["non-interactive"]).toBeDefined();
    expect(capturedOptions["non-interactive"]?.type).toBe("boolean");
  });
});

describe("packs add command parser", () => {
  const createParser = () =>
    yargs()
      .command({
        command: packsAddCommand.command,
        describe: packsAddCommand.describe,
        builder: packsAddCommand.builder,
        handler: () => {},
      })
      .exitProcess(false)
      .fail(false);

  it("parses --preview flag", async () => {
    const argv = await createParser().parse(["add", "my-pack", "some-ext", "--preview"]);
    expect(argv["preview"]).toBe(true);
  });

  it("defaults --preview to false", async () => {
    const argv = await createParser().parse(["add", "my-pack", "some-ext"]);
    expect(argv["preview"]).toBe(false);
  });
});
