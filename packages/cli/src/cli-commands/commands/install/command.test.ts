/**
 * Unit tests for the commands install command yargs definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it, vi } from "vitest";
import yargs, { type Argv, type Options, type PositionalOptions } from "yargs";
import { installCommandCommand } from "./command.js";

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

describe("commands install command", () => {
  const createParser = () => yargs().command(installCommandCommand).exitProcess(false);

  it("registers with correct description", () => {
    expect(installCommandCommand.describe).toBe("Install a command from a registry");
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("install <source>");
    expect(helpOutput).toContain("Install a command");
  });

  it("requires source positional", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();
    (installCommandCommand.builder as (y: Argv) => Argv)(mockYargs);
    expect(capturedPositionals["source"]).toBeDefined();
    expect(capturedPositionals["source"]?.demandOption).toBe(true);
  });

  it("has --force option defaulting to false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (installCommandCommand.builder as (y: Argv) => Argv)(mockYargs);
    expect(capturedOptions["force"]).toBeDefined();
    expect(capturedOptions["force"]?.default).toBe(false);
  });

  it("has --yes option defaulting to false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (installCommandCommand.builder as (y: Argv) => Argv)(mockYargs);
    expect(capturedOptions["yes"]).toBeDefined();
    expect(capturedOptions["yes"]?.default).toBe(false);
  });

  it("has --preview option defaulting to false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (installCommandCommand.builder as (y: Argv) => Argv)(mockYargs);
    expect(capturedOptions["preview"]).toBeDefined();
    expect(capturedOptions["preview"]?.default).toBe(false);
  });

  it("has --non-interactive option", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (installCommandCommand.builder as (y: Argv) => Argv)(mockYargs);
    expect(capturedOptions["non-interactive"]).toBeDefined();
  });
});
