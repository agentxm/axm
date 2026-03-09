/**
 * Unit tests for the auth logout command yargs definition.
 */

import { describe, expect, it, vi } from "vitest";
import yargs, { type Argv, type Options } from "yargs";
import { logoutCommand } from "./command.js";

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

describe("auth logout command", () => {
  const createParser = () =>
    yargs()
      .command({ ...logoutCommand, handler: () => {} })
      .exitProcess(false);

  it("registers with correct description", () => {
    expect(logoutCommand.describe).toBe("Sign out of a registry");
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("logout");
    expect(helpOutput).toContain("Sign out");
  });

  it("does not define --yes flag (global flag)", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (logoutCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["yes"]).toBeUndefined();
  });

  it("parses with no arguments", async () => {
    const parsed = await createParser().parse("logout");
    expect(parsed["_"]).toContain("logout");
  });
});
