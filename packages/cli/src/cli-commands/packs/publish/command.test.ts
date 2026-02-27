/**
 * Unit tests for the packs publish command yargs definition.
 *
 * Tests verify command description, positional arguments, options, and defaults.
 * Handler logic is tested separately in handler.test.ts.
 */

import { describe, expect, it, vi } from "vitest";
import yargs, { type Argv, type Options, type PositionalOptions } from "yargs";
import { publishPackCommand } from "./command.js";

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

describe("packs publish command", () => {
  const createParser = () => yargs().command(publishPackCommand).exitProcess(false);

  it("registers with correct description", () => {
    expect(publishPackCommand.describe).toBe("Publish a pack to a registry");
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("publish <pack>");
    expect(helpOutput).toContain("Publish a pack");
  });

  it("requires pack positional argument", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();
    (publishPackCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedPositionals["pack"]).toBeDefined();
    expect(capturedPositionals["pack"]?.type).toBe("string");
    expect(capturedPositionals["pack"]?.demandOption).toBe(true);
  });

  it("defines --registry flag as optional string", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (publishPackCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["registry"]).toBeDefined();
    expect(capturedOptions["registry"]?.type).toBe("string");
  });

  it("does not define per-command --yes, --preview, or --non-interactive (now global)", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (publishPackCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["yes"]).toBeUndefined();
    expect(capturedOptions["preview"]).toBeUndefined();
    expect(capturedOptions["non-interactive"]).toBeUndefined();
  });

  it("defines --include-dependencies flag with alias -d and default false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (publishPackCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["include-dependencies"]).toBeDefined();
    expect(capturedOptions["include-dependencies"]?.type).toBe("boolean");
    expect(capturedOptions["include-dependencies"]?.alias).toBe("d");
    expect(capturedOptions["include-dependencies"]?.default).toBe(false);
  });
});
