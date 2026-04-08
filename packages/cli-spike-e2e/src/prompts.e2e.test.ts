/**
 * E2E tests for the `axm-spike prompts` command and its sub-commands.
 */

import { describe, expect, it } from "vitest";

import {
  expectExitCode,
  expectNonInteractiveFailure,
  expectNonInteractiveSuccess,
  getOutput,
} from "@axm.sh/e2e-utils";

import { runCli } from "./utils.js";

const promptSubcommands = [
  "text",
  "password",
  "confirm",
  "path",
  "select",
  "multiselect",
  "group-multiselect",
  "select-key",
  "autocomplete",
  "autocomplete-multiselect",
] as const;

describe("axm-spike prompts", () => {
  it("prompts --help lists all 10 subcommands", async () => {
    const result = await runCli(["prompts", "--help"]);
    const output = getOutput(result);

    expectExitCode(result, 0);
    for (const sub of promptSubcommands) {
      expect(output).toContain(sub);
    }
  });

  it("prompts text --help renders help with flags", async () => {
    const result = await runCli(["prompts", "text", "--help"]);
    const output = getOutput(result);

    expectExitCode(result, 0);
    expect(output).toContain("placeholder");
    expect(output).toContain("default");
    expect(output).toContain("initial");
    expect(output).toContain("validate");
  });

  it("prompts text --non-interactive --default 'hi' succeeds", async () => {
    await expectNonInteractiveSuccess(runCli, ["prompts", "text", "--default", "hi"]);
  });

  it("prompts text --non-interactive (no default) fails with non-zero exit", async () => {
    await expectNonInteractiveFailure(runCli, ["prompts", "text"]);
  });

  it("prompts confirm --non-interactive succeeds with explicit answer", async () => {
    await expectNonInteractiveSuccess(runCli, ["prompts", "confirm", "--answer", "yes"]);
  });

  it("prompts select --non-interactive succeeds with explicit value", async () => {
    await expectNonInteractiveSuccess(runCli, ["prompts", "select", "--value", "red"]);
  });

  for (const sub of promptSubcommands) {
    it(`prompts ${sub} --help renders`, async () => {
      const result = await runCli(["prompts", sub, "--help"]);
      expectExitCode(result, 0);
    });
  }
});
