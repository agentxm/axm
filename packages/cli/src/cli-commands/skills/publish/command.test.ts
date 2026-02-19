/**
 * Unit tests for the skills publish command yargs definition.
 *
 * Tests verify command description, positional arguments, options, and defaults.
 * Handler logic is tested separately in handler.test.ts.
 */

import { describe, expect, it, vi } from "vitest";
import yargs, { type Argv, type Options, type PositionalOptions } from "yargs";
import { publishCommand } from "./command.js";

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

describe("skills publish command", () => {
  const createParser = () =>
    yargs()
      .command({ ...publishCommand, handler: () => {} })
      .exitProcess(false);

  it("registers with correct description", () => {
    expect(publishCommand.describe).toBe("Publish extensions to a registry");
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("publish <extensions..>");
    expect(helpOutput).toContain("Publish extensions");
  });

  it("requires extensions variadic positional argument", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();
    (publishCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedPositionals["extensions"]).toBeDefined();
    expect(capturedPositionals["extensions"]?.type).toBe("string");
    expect(capturedPositionals["extensions"]?.array).toBe(true);
    expect(capturedPositionals["extensions"]?.demandOption).toBe(true);
  });

  it("parses a single extension as an array", async () => {
    const parsed = await createParser().parse("publish code-review");
    expect(parsed["extensions"]).toEqual(["code-review"]);
  });

  it("parses multiple extensions as an array", async () => {
    const parsed = await createParser().parse("publish effect-* commit");
    expect(parsed["extensions"]).toEqual(["effect-*", "commit"]);
  });

  it("defines --registry flag as optional string", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (publishCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["registry"]).toBeDefined();
    expect(capturedOptions["registry"]?.type).toBe("string");
  });

  it("defines --yes flag with default false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (publishCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["yes"]).toBeDefined();
    expect(capturedOptions["yes"]?.type).toBe("boolean");
    expect(capturedOptions["yes"]?.default).toBe(false);
  });

  it("defines --preview flag with default false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (publishCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["preview"]).toBeDefined();
    expect(capturedOptions["preview"]?.type).toBe("boolean");
    expect(capturedOptions["preview"]?.default).toBe(false);
  });

  it("defines --non-interactive flag as optional boolean", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (publishCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["non-interactive"]).toBeDefined();
    expect(capturedOptions["non-interactive"]?.type).toBe("boolean");
  });
});
