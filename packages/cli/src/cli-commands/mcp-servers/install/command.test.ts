/**
 * Unit tests for the mcp-servers install command yargs definition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it, vi } from "vitest";
import yargs, { type Argv, type Options, type PositionalOptions } from "yargs";
import { installMcpServerCommand } from "./command.js";

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

describe("mcp-servers install command", () => {
  const createParser = () => yargs().command(installMcpServerCommand).exitProcess(false);

  it("registers with correct description", () => {
    expect(installMcpServerCommand.describe).toBe("Install an MCP server from a registry");
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("install <source>");
    expect(helpOutput).toContain("Install an MCP server");
  });

  it("requires source positional", () => {
    const { mockYargs, capturedPositionals } = createCapturingMock();
    (installMcpServerCommand.builder as (y: Argv) => Argv)(mockYargs);
    expect(capturedPositionals["source"]).toBeDefined();
    expect(capturedPositionals["source"]?.demandOption).toBe(true);
  });

  it("does not define per-command --yes, --force, --preview, or --non-interactive (now global)", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (installMcpServerCommand.builder as (y: Argv) => Argv)(mockYargs);
    expect(capturedOptions["yes"]).toBeUndefined();
    expect(capturedOptions["force"]).toBeUndefined();
    expect(capturedOptions["preview"]).toBeUndefined();
    expect(capturedOptions["non-interactive"]).toBeUndefined();
  });
});
