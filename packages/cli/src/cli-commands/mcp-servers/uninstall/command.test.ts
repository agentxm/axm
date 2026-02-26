/**
 * Unit tests for the mcp-servers uninstall command yargs definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it, vi } from "vitest";
import yargs, { type Argv, type Options, type PositionalOptions } from "yargs";
import { uninstallMcpServerCommand } from "./command.js";

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

describe("mcp-servers uninstall command", () => {
  const createParser = () => yargs().command(uninstallMcpServerCommand).exitProcess(false);

  it("registers with correct description", () => {
    expect(uninstallMcpServerCommand.describe).toBe("Uninstall an MCP server");
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("uninstall <name>");
    expect(helpOutput).toContain("Uninstall an MCP server");
  });

  it("requires name positional", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();
    (uninstallMcpServerCommand.builder as (y: Argv) => Argv)(mockYargs);
    expect(capturedPositionals["name"]).toBeDefined();
    expect(capturedPositionals["name"]?.demandOption).toBe(true);
  });

  it("has --yes option defaulting to false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (uninstallMcpServerCommand.builder as (y: Argv) => Argv)(mockYargs);
    expect(capturedOptions["yes"]).toBeDefined();
    expect(capturedOptions["yes"]?.default).toBe(false);
  });

  it("has --preview option defaulting to false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (uninstallMcpServerCommand.builder as (y: Argv) => Argv)(mockYargs);
    expect(capturedOptions["preview"]).toBeDefined();
    expect(capturedOptions["preview"]?.default).toBe(false);
  });
});
