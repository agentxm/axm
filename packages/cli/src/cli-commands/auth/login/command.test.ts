/**
 * Unit tests for the auth login command yargs definition.
 */

import { describe, expect, it, vi } from "vitest";
import yargs, { type Argv, type Options } from "yargs";
import { loginCommand } from "./command.js";

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

describe("auth login command", () => {
  const createParser = () =>
    yargs()
      .command({ ...loginCommand, handler: () => {} })
      .exitProcess(false);

  it("registers with correct description", () => {
    expect(loginCommand.describe).toBe("Sign in to a registry");
  });

  it("shows command in help output", async () => {
    const helpOutput = await createParser().getHelp();
    expect(helpOutput).toContain("login");
    expect(helpOutput).toContain("Sign in");
  });

  it("does not define --yes flag (global flag)", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (loginCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["yes"]).toBeUndefined();
  });

  it("does not define --non-interactive flag (global flag)", () => {
    const { mockYargs, capturedOptions } = createCapturingMock();
    (loginCommand.builder as (yargs: Argv) => Argv)(mockYargs);
    expect(capturedOptions["non-interactive"]).toBeUndefined();
  });

  it("parses with no arguments", async () => {
    const parsed = await createParser().parse("login");
    expect(parsed["_"]).toContain("login");
  });
});
