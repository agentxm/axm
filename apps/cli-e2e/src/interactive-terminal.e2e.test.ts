import { afterAll, describe, expect, it } from "vitest";

import { Keys, ptyIsSupported, runCliUnderPty, runUnderPty } from "./pty.js";
import { createTempDir } from "./utils.js";

const shell = { runtime: "binary", path: "/bin/sh" } as const;
// `stty`, `tput`, and `printf` are found on PATH, and `tput` reads TERM.
const shellEnv = { PATH: process.env["PATH"] ?? "/usr/bin:/bin", TERM: "xterm-256color" };

const temporary: Array<{ readonly cleanup: () => void }> = [];
const tempDir = (prefix: string) => {
  const created = createTempDir(prefix);
  temporary.push(created);
  return created.path;
};

afterAll(() => {
  for (const created of temporary) created.cleanup();
});

/** The row the selection cursor sits on, as the last frame painted it. */
const cursorRow = (frame: string): string => {
  const row = frame
    .split("\n")
    .filter((line) => line.startsWith(">"))
    .at(-1);
  if (row === undefined) throw new Error(`No cursor row in frame:\n${frame}`);
  return row.trim();
};

/** The `[x]` or `[ ]` mark on the Claude Code row of the last frame. */
const claudeCodeMark = (frame: string): string => {
  const row = frame
    .split("\n")
    .filter((line) => line.includes("] Claude Code "))
    .at(-1);
  if (row === undefined) throw new Error(`No Claude Code row in frame:\n${frame}`);
  return row.slice(row.indexOf("["), row.indexOf("]") + 1);
};

describe.skipIf(!ptyIsSupported)("pseudo-terminal harness", () => {
  it("gives the subject a terminal of the requested size", async () => {
    const result = await runUnderPty(
      shell,
      ["-c", "tput cols; tput lines; test -t 0 && echo tty"],
      { columns: 132, rows: 44, env: shellEnv },
    );

    expect(result.exitCode, result.transcript).toBe(0);
    expect(result.transcript.split("\n").filter(Boolean)).toEqual(["132", "44", "tty"]);
  });

  it("reports a terminal the subject left in raw mode", async () => {
    const leaked = await runUnderPty(shell, ["-c", "stty raw -echo"], { env: shellEnv });

    expect(leaked.exitCode, leaked.transcript).toBe(0);
    expect(leaked.rawModeRestored).toBe(false);
  });

  it("reports a terminal the subject handed back", async () => {
    const restored = await runUnderPty(shell, ["-c", "stty raw -echo; stty sane"], {
      env: shellEnv,
    });

    expect(restored.exitCode, restored.transcript).toBe(0);
    expect(restored.rawModeRestored).toBe(true);
  });

  it("reports a cursor the subject left hidden", async () => {
    const hidden = await runUnderPty(shell, ["-c", "printf '\\033[?25l'"], { env: shellEnv });
    const shown = await runUnderPty(shell, ["-c", "printf '\\033[?25l\\033[?25h'"], {
      env: shellEnv,
    });

    expect(hidden.cursorRestored).toBe(false);
    expect(shown.cursorRestored).toBe(true);
  });
});

describe.skipIf(!ptyIsSupported)("axm prompts under a pseudo-terminal", () => {
  it("opens the agent selection, takes keys, and restores the terminal on interrupt", async () => {
    const result = await runCliUnderPty(["setup", "--scope", "project"], {
      home: tempDir("axm-pty-home-"),
      cwd: tempDir("axm-pty-workspace-"),
      columns: 100,
      rows: 30,
      actions: [
        { awaiting: "Select agents to configure" },
        { send: Keys.down },
        { send: "clau" },
        { send: Keys.space },
        { send: Keys.interrupt },
      ],
    });

    const [opened, moved, filtered, toggled] = result.actions;
    expect(opened?.matched, result.transcript).toBe(true);

    // An arrow arrives as an escape sequence and has to be decoded as one key.
    expect(cursorRow(moved?.emitted ?? "")).not.toBe(cursorRow(opened?.emitted ?? ""));

    // Printable text reaches the prompt's own filter.
    expect(filtered?.emitted).toContain("Filter: clau");
    expect(filtered?.emitted).toContain("Claude Code");

    // Space toggles the row the cursor sits on.
    expect(claudeCodeMark(toggled?.emitted ?? "")).not.toBe(
      claudeCodeMark(filtered?.emitted ?? ""),
    );

    // Raw mode suppresses SIGINT, so the interrupt is the prompt's own quit
    // and the terminal has to come back from it.
    expect(result.timedOut, result.transcript).toBe(false);
    expect(result.exitCode, result.transcript).toBe(0);
    expect(result.rawModeRestored, "raw mode was not handed back").toBe(true);
    expect(result.cursorRestored, "the cursor was left hidden").toBe(true);
  });
});
