import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";
import { CliError } from "effect/unstable/cli";

import { ExitCode } from "../app-error/index.js";
import { makeErrorEvent } from "./output-mode.js";
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
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((...args: Array<unknown>) => {
      stderrWrites.push(String(args[0]));
      return true;
    });
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new ExitCalled(typeof code === "number" ? code : 0);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("drops formatter help stdout and emits one usage envelope for json parser errors", async () => {
    const execute = () =>
      Effect.sync(() => {
        console.log('{"type":"help","usage":"axm token create [flags]"}');
        process.stderr.write(
          `${JSON.stringify(makeErrorEvent("usage", "Missing required flag: --name"))}\n`,
        );
      }).pipe(
        Effect.andThen(
          Effect.fail(
            new CliError.ShowHelp({
              commandPath: ["axm", "token", "create"],
              errors: [new CliError.MissingOption({ option: "name" })],
            }),
          ),
        ),
      );

    await expect(
      runCliMain(execute, { args: ["token", "create", "--json"] }),
    ).rejects.toMatchObject({
      code: ExitCode.Usage,
    });

    expect(stdoutWrites).toHaveLength(1);
    const stdoutDoc: unknown = JSON.parse(stdoutWrites[0] ?? "");
    expect(stdoutDoc).toMatchObject({
      ok: false,
      code: "usage",
      title: "Usage Error",
      detail: "Missing required flag: --name",
    });
    expect(stdoutWrites.join("")).not.toContain('"type":"help"');

    expect(stderrWrites).toEqual([
      `${JSON.stringify(makeErrorEvent("usage", "Missing required flag: --name"))}\n`,
    ]);
  });

  it("releases one complete JSON document after a successful machine invocation", async () => {
    const document = { ok: true, result: { outcome: "no-op" } };
    const execute = () =>
      Effect.sync(() => {
        process.stdout.write(`${JSON.stringify(document)}\n`);
      });

    await runCliMain(execute, { args: ["sync", "--json"] });

    expect(stdoutWrites).toEqual([`${JSON.stringify(document)}\n`]);
    expect(stderrWrites).toEqual([]);
  });

  it("replaces concatenated machine documents with one internal-error envelope", async () => {
    const execute = () =>
      Effect.sync(() => {
        process.stdout.write('{"ok":true}\n');
        process.stdout.write('{"ok":true}\n');
      });

    await expect(runCliMain(execute, { args: ["sync", "--json"] })).rejects.toMatchObject({
      code: ExitCode.Internal,
    });

    expect(stdoutWrites).toHaveLength(1);
    expect(JSON.parse(stdoutWrites.join(""))).toMatchObject({
      ok: false,
      code: "internal",
    });
    expect(stdoutWrites.join("")).not.toContain('{"ok":true}');
  });

  it("replaces stray human stdout with one internal-error envelope in machine mode", async () => {
    const execute = () =>
      Effect.sync(() => {
        process.stdout.write("Preparing workspace...\n");
        process.stdout.write('{"ok":true}\n');
      });

    await expect(runCliMain(execute, { args: ["setup", "--json"] })).rejects.toMatchObject({
      code: ExitCode.Internal,
    });

    expect(stdoutWrites).toHaveLength(1);
    expect(JSON.parse(stdoutWrites.join(""))).toMatchObject({
      ok: false,
      code: "internal",
    });
    expect(stdoutWrites.join("")).not.toContain("Preparing workspace");
  });

  it("routes text parser usage help to stderr and drops the duplicate terse parser error", async () => {
    const execute = () =>
      Effect.sync(() => {
        console.log("ERROR\n  Missing required flag: --name\n\nUSAGE\n  axm token create [flags]");
        process.stderr.write("\nERROR\n  Missing required flag: --name\n");
      }).pipe(
        Effect.andThen(
          Effect.fail(
            new CliError.ShowHelp({
              commandPath: ["axm", "token", "create"],
              errors: [new CliError.MissingOption({ option: "name" })],
            }),
          ),
        ),
      );

    await expect(runCliMain(execute, { args: ["token", "create"] })).rejects.toMatchObject({
      code: ExitCode.Usage,
    });

    expect(stdoutWrites).toEqual([]);
    expect(stderrWrites.join("")).toBe(
      "ERROR\n  Missing required flag: --name\n\nUSAGE\n  axm token create [flags]\n",
    );
  });

  describe("interactive output buffering", () => {
    let originalIsTTY: boolean | undefined;
    let originalCI: string | undefined;

    beforeEach(() => {
      originalIsTTY = process.stdin.isTTY;
      originalCI = process.env["CI"];
    });

    afterEach(() => {
      Object.defineProperty(process.stdin, "isTTY", {
        value: originalIsTTY,
        configurable: true,
      });
      if (originalCI === undefined) {
        delete process.env["CI"];
      } else {
        process.env["CI"] = originalCI;
      }
    });

    const setTTY = (value: boolean) => {
      Object.defineProperty(process.stdin, "isTTY", { value, configurable: true });
    };

    it("does not withhold output in an interactive TTY session (prevents hangs)", async () => {
      setTTY(true);
      delete process.env["CI"];

      // Records whether stdout had already reached the real writer at the moment
      // the program wrote it — i.e. before runCliMain resolves. With buffering on,
      // the write is captured and only flushed after completion, so this is false.
      let visibleDuringExecution = false;
      const execute = () =>
        Effect.sync(() => {
          process.stdout.write("live frame\n");
          visibleDuringExecution = stdoutWrites.includes("live frame\n");
        });

      await runCliMain(execute, { args: ["setup"] });

      expect(visibleDuringExecution).toBe(true);
      expect(stdoutWrites).toContain("live frame\n");
    });

    it("still buffers on a TTY when --non-interactive is passed", async () => {
      setTTY(true);
      delete process.env["CI"];

      let visibleDuringExecution = false;
      const execute = () =>
        Effect.sync(() => {
          process.stdout.write("buffered frame\n");
          visibleDuringExecution = stdoutWrites.includes("buffered frame\n");
        });

      await runCliMain(execute, { args: ["setup", "--non-interactive"] });

      expect(visibleDuringExecution).toBe(false);
      expect(stdoutWrites).toContain("buffered frame\n");
    });

    it("still buffers on a TTY under CI", async () => {
      setTTY(true);
      process.env["CI"] = "true";

      let visibleDuringExecution = false;
      const execute = () =>
        Effect.sync(() => {
          process.stdout.write("buffered frame\n");
          visibleDuringExecution = stdoutWrites.includes("buffered frame\n");
        });

      await runCliMain(execute, { args: ["setup"] });

      expect(visibleDuringExecution).toBe(false);
      expect(stdoutWrites).toContain("buffered frame\n");
    });
  });
});
