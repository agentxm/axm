/**
 * Unit tests for the auth whoami command yargs definition.
 */

import { describe, expect, it, vi } from "vitest";
import yargs, { type Argv, type Options } from "yargs";
import { whoamiCommand } from "./command.js";

type CapturedOptions = Record<string, Options>;

const createCapturingMock = () => {
  const capturedOptions: CapturedOptions = {};

  const mock = {
    option: vi.fn((name: string, config: Options) => {
      capturedOptions[name] = config;
      return mock;
    }),
    example: vi.fn().mockReturnThis(),
  };

  return { mockYargs: mock as unknown as Argv, capturedOptions };
};

describe("auth whoami command", () => {
  const createParser = () =>
    yargs()
      .command({ ...whoamiCommand, handler: () => {} })
      .exitProcess(false);

  it("registers with correct description", () => {
    expect(whoamiCommand.describe).toBe("Show current authenticated identity");
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("whoami");
    expect(helpOutput).toContain("authenticated identity");
  });

  it("defines --json flag as boolean with default false", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (whoamiCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["json"]).toBeDefined();
    expect(capturedOptions["json"]?.type).toBe("boolean");
    expect(capturedOptions["json"]?.default).toBe(false);
  });

  it("parses --json flag", async () => {
    const parsed = await createParser().parse("whoami --json");
    expect(parsed["json"]).toBe(true);
  });

  it("defaults json to false", async () => {
    const parsed = await createParser().parse("whoami");
    expect(parsed["json"]).toBe(false);
  });
});
