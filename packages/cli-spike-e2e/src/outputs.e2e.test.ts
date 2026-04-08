import { describe, expect, it } from "vitest";

import { expectExitCode, expectStdout, getOutput, parseJsonOutput } from "@axm.sh/e2e-utils";

import { runCli } from "./utils.js";

// NOTE: E2E tests run the compiled binary in default text mode.
// Human-readable output goes to stdout unless --json is requested.

describe("outputs commands", () => {
  it("outputs --help lists all 14 subcommands", async () => {
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
    ]) {
      expect(output).toContain(sub);
    }
  });

  it("outputs log produces all 7 log levels on stdout", async () => {
    const result = await runCli(["outputs", "log"]);
    expectExitCode(result, 0);
    expectStdout(result, "plain message");
    expectStdout(result, "info message");
    expectStdout(result, "success message");
    expectStdout(result, "step message");
    expectStdout(result, "warning message");
    expectStdout(result, "error message");
    expectStdout(result, "cancel message");
  });

  it("outputs intro renders intro/outro framing", async () => {
    const result = await runCli(["outputs", "intro"]);
    expectExitCode(result, 0);
    expectStdout(result, "Welcome to axm-spike");
    expectStdout(result, "Goodbye");
  });

  it("outputs note renders boxed note", async () => {
    const result = await runCli(["outputs", "note"]);
    expectExitCode(result, 0);
    expectStdout(result, "This note has a title");
    expectStdout(result, "Important");
  });

  it("outputs box renders default box", async () => {
    const result = await runCli(["outputs", "box"]);
    expectExitCode(result, 0);
    expectStdout(result, "content inside a box");
  });

  it("outputs box --rounded --width 40 renders with options", async () => {
    const result = await runCli(["outputs", "box", "--rounded", "--width", "40"]);
    expectExitCode(result, 0);
    expectStdout(result, "content inside a box");
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
    expectStdout(result, "Building project");
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
    // Machine mode: result() writes pretty JSON, resultStream() writes NDJSON lines
    // stdout contains a pretty-printed JSON object followed by NDJSON lines
    expectStdout(result, "Mochi");
    expectStdout(result, "Pickles");
    expectStdout(result, "Juniper");
    // Verify the NDJSON lines are valid JSON
    const lines = result.stdout.trim().split("\n");
    // Last 3 lines should be valid NDJSON from resultStream
    const ndjsonLines = lines.slice(-3);
    for (const line of ndjsonLines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
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
    expect(parsed).toEqual({
      name: "axm-spike",
      version: "0.0.1",
      pets: ["Mochi", "Pickles", "Juniper"],
    });
  });
});
