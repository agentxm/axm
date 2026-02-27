/**
 * Unit tests for the commands uninstall command yargs definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it, vi } from "vitest";
import yargs, { type Argv, type Options, type PositionalOptions } from "yargs";
import { uninstallCommandCommand } from "./command.js";

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

describe("commands uninstall command", () => {
  const createParser = () => yargs().command(uninstallCommandCommand).exitProcess(false);

  it("registers with correct description", () => {
    expect(uninstallCommandCommand.describe).toBe("Uninstall a command");
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("uninstall <name>");
    expect(helpOutput).toContain("Uninstall a command");
  });

  it("requires name positional", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();
    (uninstallCommandCommand.builder as (y: Argv) => Argv)(mockYargs);
    expect(capturedPositionals["name"]).toBeDefined();
    expect(capturedPositionals["name"]?.demandOption).toBe(true);
  });

  it("does not define per-command --yes, --preview, or --non-interactive (now global)", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (uninstallCommandCommand.builder as (y: Argv) => Argv)(mockYargs);
    expect(capturedOptions["yes"]).toBeUndefined();
    expect(capturedOptions["preview"]).toBeUndefined();
    expect(capturedOptions["non-interactive"]).toBeUndefined();
  });
});
