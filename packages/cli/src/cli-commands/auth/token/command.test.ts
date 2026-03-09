/**
 * Unit tests for the auth token command yargs definition.
 */

import { describe, expect, it, vi } from "vitest";
import yargs, { type Argv, type Options } from "yargs";
import { tokenCommand } from "./command.js";

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

describe("auth token command", () => {
  const createParser = () =>
    yargs()
      .command({ ...tokenCommand, handler: () => {} })
      .exitProcess(false);

  it("registers with correct description", () => {
    expect(tokenCommand.describe).toBe("Output current auth token to stdout");
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("token");
    expect(helpOutput).toContain("auth token");
  });

  it("does not define custom flags", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (tokenCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(Object.keys(capturedOptions)).toHaveLength(0);
  });

  it("parses with no arguments", async () => {
    const parsed = await createParser().parse("token");
    expect(parsed["_"]).toContain("token");
  });
});
