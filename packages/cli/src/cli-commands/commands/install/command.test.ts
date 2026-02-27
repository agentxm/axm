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

  it("does not define per-command --yes, --force, --preview, or --non-interactive (now global)", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (installCommandCommand.builder as (y: Argv) => Argv)(mockYargs);
    expect(capturedOptions["yes"]).toBeUndefined();
    expect(capturedOptions["force"]).toBeUndefined();
    expect(capturedOptions["preview"]).toBeUndefined();
    expect(capturedOptions["non-interactive"]).toBeUndefined();
  });
});
