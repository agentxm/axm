/**
 * Unit tests for the skills fork command yargs definition.
 *
 * Tests verify command description, positional arguments, options, and defaults.
 * Handler logic is tested separately in handler.test.ts.
 */

import { describe, expect, it, vi } from "vitest";
import yargs, { type Argv, type Options, type PositionalOptions } from "yargs";
import { forkCommand } from "./command.js";

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

describe("skills fork command", () => {
  const createParser = () => yargs().command(forkCommand).exitProcess(false);

  it("registers with correct description", () => {
    expect(forkCommand.describe).toBe(
      "Fork a skill into a managed extension and publish to a registry",
    );
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("fork <source>");
    expect(helpOutput).toContain("Fork a skill");
  });

  it("requires source positional argument", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();
    (forkCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedPositionals["source"]).toBeDefined();
    expect(capturedPositionals["source"]?.type).toBe("string");
    expect(capturedPositionals["source"]?.demandOption).toBe(true);
  });

  it("defines --yes flag with default false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (forkCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["yes"]).toBeDefined();
    expect(capturedOptions["yes"]?.type).toBe("boolean");
    expect(capturedOptions["yes"]?.default).toBe(false);
  });

  it("defines --preview flag with default false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (forkCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["preview"]).toBeDefined();
    expect(capturedOptions["preview"]?.type).toBe("boolean");
    expect(capturedOptions["preview"]?.default).toBe(false);
  });

  it("defines --non-interactive flag as optional boolean", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (forkCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["non-interactive"]).toBeDefined();
    expect(capturedOptions["non-interactive"]?.type).toBe("boolean");
  });

  it("defines --skill flag as string array with default empty", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (forkCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["skill"]).toBeDefined();
    expect(capturedOptions["skill"]?.type).toBe("string");
    expect(capturedOptions["skill"]?.array).toBe(true);
    expect(capturedOptions["skill"]?.default).toEqual([]);
  });

  it("parses --skill as string array via builder", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (forkCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["skill"]?.describe).toContain("glob pattern");
  });
});
