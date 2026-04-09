import { describe, expect, it } from "vitest";

import {
  expectExitCode,
  expectStderr,
  expectStdout,
  getOutput,
  parseJsonOutput,
} from "@axm.sh/e2e-utils";

import { runCli } from "./utils.js";

// NOTE: E2E tests run the compiled binary in default text mode.
// Human-readable renderer output goes to stderr; --json payloads go to stdout.

describe("outputs commands", () => {
  it("outputs --help lists all renderer demo subcommands", async () => {
    const result = await runCli(["outputs", "--help"]);
    expectExitCode(result, 0);
    const output = getOutput(result);
    for (const sub of [
      "log",
      "intro",
      "note",
      "box",
      "spinner",
      "progress",
      "task-log",
      "run-tasks",
      "table",
      "detail",
      "tree",
      "stream-log",
      "result",
      "raw",
      "sink",
    ]) {
      expect(output).toContain(sub);
    }
  });

  it("outputs log renders the requested log message", async () => {
    const result = await runCli(["outputs", "log", "Build succeeded", "--level", "success"]);
    expectExitCode(result, 0);
    expectStderr(result, "Build succeeded");
  });

  it("outputs intro renders intro framing", async () => {
    const result = await runCli(["outputs", "intro"]);
    expectExitCode(result, 0);
    expectStderr(result, "Welcome to axm-spike");
  });

  it("outputs note renders boxed note", async () => {
    const result = await runCli([
      "outputs",
      "note",
      "Read the deploy checklist",
      "--title",
      "Reminder",
    ]);
    expectExitCode(result, 0);
    expectStderr(result, "Read the deploy checklist");
    expectStderr(result, "Reminder");
  });

  it("outputs box renders default box", async () => {
    const result = await runCli(["outputs", "box"]);
    expectExitCode(result, 0);
    expectStderr(result, "This box renders one message at a time.");
  });

  it("outputs box --rounded --width 40 renders with options", async () => {
    const result = await runCli(["outputs", "box", "--rounded", "--width", "40"]);
    expectExitCode(result, 0);
    expectStderr(result, "This box renders one message at a time.");
  });

  it("outputs spinner completes with success", async () => {
    const result = await runCli(["outputs", "spinner"], { timeout: 15000 });
    expectExitCode(result, 0);
  }, 15000);

  it("outputs progress --style block renders progress bar", async () => {
    const result = await runCli(["outputs", "progress", "--style", "block"], { timeout: 15000 });
    expectExitCode(result, 0);
  }, 15000);

  it("outputs task-log --retain-log retains output", async () => {
    const result = await runCli(["outputs", "task-log", "--retain-log"], { timeout: 15000 });
    expectExitCode(result, 0);
    expectStderr(result, "Building project");
  }, 15000);

  it("outputs run-tasks shows task status", async () => {
    const result = await runCli(["outputs", "run-tasks"], { timeout: 30000 });
    expectExitCode(result, 0);
  }, 35000);

  it("outputs table exits successfully", async () => {
    // In machine mode, table is a no-op (no output), but should exit 0
    const result = await runCli(["outputs", "table"]);
    expectExitCode(result, 0);
  });

  it("outputs table --caption accepts caption flag", async () => {
    // In machine mode, table is a no-op, but the flag should be accepted
    const result = await runCli(["outputs", "table", "--caption", "My Table"]);
    expectExitCode(result, 0);
  });

  it("outputs detail exits successfully", async () => {
    // In machine mode, detail is a no-op (no output), but should exit 0
    const result = await runCli(["outputs", "detail"]);
    expectExitCode(result, 0);
  });

  it("outputs tree exits successfully", async () => {
    // In machine mode, tree is a no-op (no output), but should exit 0
    const result = await runCli(["outputs", "tree"]);
    expectExitCode(result, 0);
  });

  it("outputs stream-log produces streaming output", async () => {
    const result = await runCli(["outputs", "stream-log"], { timeout: 15000 });
    expectExitCode(result, 0);
  }, 15000);

  it("outputs result renders human-readable output", async () => {
    const result = await runCli(["outputs", "result"]);
    expectExitCode(result, 0);
    expectStdout(result, "Mochi");
  });

  it("outputs result --json emits structured data to stdout", async () => {
    const result = await runCli(["outputs", "result", "--json"]);
    expectExitCode(result, 0);
    const parsed = parseJsonOutput(result);
    expect(parsed).toEqual(
      expect.objectContaining({
        command: "outputs.result",
        count: 1,
        data: expect.objectContaining({
          kind: "single",
          item: expect.objectContaining({
            name: "Mochi",
            species: "cat",
          }),
        }),
      }),
    );
  });

  it("outputs result --stream --json emits the list variant of the published document", async () => {
    const result = await runCli(["outputs", "result", "--stream", "--json"]);
    expectExitCode(result, 0);
    const parsed = parseJsonOutput(result);
    expect(parsed).toEqual(
      expect.objectContaining({
        command: "outputs.result",
        count: 3,
        data: expect.objectContaining({
          kind: "list",
          items: expect.arrayContaining([
            expect.objectContaining({ name: "Mochi" }),
            expect.objectContaining({ name: "Juniper" }),
          ]),
        }),
      }),
    );
  });

  it("outputs raw outputs unformatted text", async () => {
    const result = await runCli(["outputs", "raw"]);
    expectExitCode(result, 0);
    expectStdout(result, "Name: axm-spike");
    expectStdout(result, "Version: 0.0.1");
  });

  it("outputs raw --json outputs JSON", async () => {
    const result = await runCli(["outputs", "raw", "--json"]);
    expectExitCode(result, 0);
    const parsed = parseJsonOutput(result);
    expect(parsed).toEqual(
      expect.objectContaining({
        command: "outputs.raw",
        data: expect.objectContaining({
          lines: ["Name: axm-spike", "Version: 0.0.1", "Pets: Mochi, Pickles, Juniper"],
        }),
      }),
    );
  });

  it("outputs tree --json emits recursive tree data", async () => {
    const result = await runCli(["outputs", "tree", "--json"]);
    expectExitCode(result, 0);
    const parsed = parseJsonOutput(result);
    expect(parsed).toEqual(
      expect.objectContaining({
        command: "outputs.tree",
        data: expect.objectContaining({
          roots: expect.arrayContaining([
            expect.objectContaining({
              name: "packages",
              children: expect.arrayContaining([
                expect.objectContaining({ name: "core" }),
                expect.objectContaining({ name: "cli-spike" }),
              ]),
            }),
          ]),
        }),
      }),
    );
  });
});
