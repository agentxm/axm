import * as fs from "node:fs";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { Keys, ptyIsSupported, runCliUnderPty, runUnderPty } from "./pty.js";
import { writeAuthoredSkill } from "./test-support/protected-state.js";
import { writeLocalSkillPackage } from "./test-support/spec-file-store.js";
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

/**
 * A workspace whose only mutation carries a confirmable risk: replacing an
 * authored package with a local source. It is the one plan that opens the
 * review gate, and nothing in it needs a registry.
 */
const gateWorkspace = () => {
  const home = tempDir("axm-pty-home-");
  const cwd = tempDir("axm-pty-workspace-");
  fs.writeFileSync(
    path.join(cwd, "axm.json"),
    JSON.stringify({
      owner: "@acme",
      agents: [],
      skills: { review: "workspace" },
      minimumReleaseAge: "0s",
    }),
  );
  writeAuthoredSkill(cwd, { name: "review", description: "Previous authored guidance." });
  writeLocalSkillPackage(cwd, { name: "review", body: "Selected replacement guidance." });
  return {
    home,
    cwd,
    authoredSkillExists: () => fs.existsSync(path.join(cwd, "skills", "review")),
    settings: (): unknown => JSON.parse(fs.readFileSync(path.join(cwd, "axm.json"), "utf8")),
  };
};

const demote = ["demote", "@acme/skills/review", "./vendor/review"];

const gateEnv = {
  AXM_NO_UPDATE_CHECK: "1",
  AXM_REGISTRY_LOCATION: "https://registry.invalid",
  AXM_REGISTRY_URL: "https://registry.invalid",
};

describe.skipIf(!ptyIsSupported)("the review gate under a pseudo-terminal", () => {
  it("shows the gate with its key chips, and applies the plan when it is answered yes", async () => {
    const workspace = gateWorkspace();

    const result = await runCliUnderPty(demote, {
      home: workspace.home,
      cwd: workspace.cwd,
      columns: 100,
      rows: 30,
      env: gateEnv,
      actions: [{ awaiting: "Apply changes?" }, { send: "y" }],
    });

    const [opened] = result.actions;
    expect(opened?.matched, result.transcript).toBe(true);
    // The risk-bearing choice comes first, capitalised because enter takes it.
    expect(opened?.emitted).toContain("Apply changes?");
    expect(opened?.emitted).toContain("N  no");
    expect(opened?.emitted).toContain("y  yes");
    expect(opened?.emitted).toContain("d  details");

    // Answered, the question leaves exactly one line behind.
    expect(result.transcript, result.transcript).toContain("Apply changes");
    expect(result.transcript).toMatch(/✔ {3}Apply changes {2,}yes/u);

    expect(result.exitCode, result.transcript).toBe(0);
    expect(workspace.settings()).toMatchObject({ skills: { review: "./vendor/review" } });
    expect(workspace.authoredSkillExists()).toBe(false);
    expect(result.rawModeRestored, "raw mode was not handed back").toBe(true);
    expect(result.cursorRestored, "the cursor was left hidden").toBe(true);
  });

  it("shows the plan again on details, then leaves the workspace alone when declined", async () => {
    const workspace = gateWorkspace();

    const result = await runCliUnderPty(demote, {
      home: workspace.home,
      cwd: workspace.cwd,
      columns: 100,
      rows: 30,
      env: gateEnv,
      actions: [
        { awaiting: "Apply changes?" },
        { send: "d" },
        { awaiting: "Apply changes?" },
        { send: "n" },
      ],
    });

    const [, detailed, asked] = result.actions;
    // Details shows the plan again and asks once more without that choice.
    expect(detailed?.emitted, result.transcript).toContain("@acme/skills/review");
    expect(asked?.matched, result.transcript).toBe(true);
    expect(result.transcript.lastIndexOf("d  details")).toBeLessThan(
      result.transcript.lastIndexOf("Apply changes?"),
    );

    expect(result.transcript).toMatch(/✔ {3}Apply changes {2,}no/u);
    expect(workspace.settings()).toMatchObject({ skills: { review: "workspace" } });
    expect(workspace.authoredSkillExists()).toBe(true);
    expect(result.rawModeRestored, "raw mode was not handed back").toBe(true);
    expect(result.cursorRestored, "the cursor was left hidden").toBe(true);
  });

  it("leaves the workspace alone when the gate is interrupted", async () => {
    const workspace = gateWorkspace();

    const result = await runCliUnderPty(demote, {
      home: workspace.home,
      cwd: workspace.cwd,
      columns: 100,
      rows: 30,
      env: gateEnv,
      actions: [{ awaiting: "Apply changes?" }, { send: Keys.interrupt }],
    });

    expect(result.timedOut, result.transcript).toBe(false);
    expect(workspace.settings()).toMatchObject({ skills: { review: "workspace" } });
    expect(workspace.authoredSkillExists()).toBe(true);
    expect(result.rawModeRestored, "raw mode was not handed back").toBe(true);
    expect(result.cursorRestored, "the cursor was left hidden").toBe(true);
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
