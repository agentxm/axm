import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";

import { ExitCode, makeAppError } from "../app-error/index.js";
import { effectCliExit } from "./effect-cli-exit.js";
import { runCliMain } from "./run-cli-main.js";

class ExitCalled extends Error {
  readonly code: number;

  constructor(code: number) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}

describe("runCliMain", () => {
  let stdoutWrites: Array<string>;
  let stderrWrites: Array<string>;

  beforeEach(() => {
    stdoutWrites = [];
    stderrWrites = [];
    vi.spyOn(process.stdout, "write").mockImplementation((...args: Array<unknown>) => {
      stdoutWrites.push(String(args[0]));
      const callback = args.find(
        (arg): arg is (error?: Error | null) => void => typeof arg === "function",
      );
      callback?.();
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((...args: Array<unknown>) => {
      stderrWrites.push(String(args[0]));
      const callback = args.find(
        (arg): arg is (error?: Error | null) => void => typeof arg === "function",
      );
      callback?.();
      return true;
    });
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new ExitCalled(typeof code === "number" ? code : 0);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leaves successful Screen-owned output untouched", async () => {
    await runCliMain(() => Effect.void, { args: ["sync", "--json"] });
    expect(stdoutWrites).toEqual([]);
    expect(stderrWrites).toEqual([]);
  });

  it("renders bootstrap failures through a machine Screen", async () => {
    await expect(
      runCliMain(
        () => Effect.fail(makeAppError({ code: "usage", detail: "Missing required flag" })),
        { args: ["token", "create", "--json"] },
      ),
    ).rejects.toMatchObject({ code: ExitCode.Usage });

    expect(stdoutWrites).toHaveLength(1);
    expect(JSON.parse(stdoutWrites.join(""))).toMatchObject({
      ok: false,
      code: "usage",
      detail: "Missing required flag",
    });
    expect(stderrWrites).toHaveLength(1);
    expect(JSON.parse(stderrWrites[0] ?? "")).toMatchObject({
      type: "error",
      code: "usage",
    });
  });

  it("renders bootstrap failures through an interactive Screen", async () => {
    await expect(
      runCliMain(() => Effect.fail(makeAppError({ code: "conflict", detail: "Already exists" })), {
        args: ["install", "--non-interactive"],
      }),
    ).rejects.toMatchObject({ code: ExitCode.Conflict });

    expect(stdoutWrites).toEqual([]);
    expect(stderrWrites.join("")).toContain("Already exists");
  });

  it("does not replace process or console writers", async () => {
    const stdoutWrite = process.stdout.write;
    const stderrWrite = process.stderr.write;
    const consoleLog = console.log;

    await runCliMain(() =>
      Effect.sync(() => {
        expect(process.stdout.write).toBe(stdoutWrite);
        expect(process.stderr.write).toBe(stderrWrite);
        expect(console.log).toBe(consoleLog);
      }),
    );
  });

  it("preserves a semantic exit without adding output", async () => {
    await expect(
      runCliMain(() => Effect.die(effectCliExit(ExitCode.Issues)), {
        args: ["lint", "--json"],
      }),
    ).rejects.toMatchObject({ code: ExitCode.Issues });
    expect(stdoutWrites).toEqual([]);
    expect(stderrWrites).toEqual([]);
  });
});
