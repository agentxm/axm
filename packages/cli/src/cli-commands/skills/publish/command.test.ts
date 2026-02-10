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
  const createParser = () => yargs().command(publishCommand).exitProcess(false);

  it("registers with correct description", () => {
    expect(publishCommand.describe).toBe("Publish a managed extension to a registry");
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("publish <extension>");
    expect(helpOutput).toContain("Publish a managed extension");
  });

  it("requires extension positional argument", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();
    (publishCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedPositionals["extension"]).toBeDefined();
    expect(capturedPositionals["extension"]?.type).toBe("string");
    expect(capturedPositionals["extension"]?.demandOption).toBe(true);
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
