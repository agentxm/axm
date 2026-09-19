import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { Keys, ptyIsSupported, runCliUnderPty, runUnderPty } from "./pty.js";
import { writeAuthoredSkill } from "./test-support/protected-state.js";
import { writeLocalSkillPackage } from "./test-support/spec-file-store.js";
import { createTempDir, runCli } from "./utils.js";

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
/** The row the caret stands on in the last frame of a list. */
const cursorRow = (frame: string): string => {
  const row = frame
    .split("\n")
    .filter((line) => line.startsWith(" ❯ "))
    .at(-1);
  if (row === undefined) throw new Error(`No cursor row in frame:\n${frame}`);
  return row.trim();
};

/** The `◉` or `◯` mark on the Claude Code row of the last frame. */
const claudeCodeMark = (frame: string): string => {
  const mark = [...frame.matchAll(/([◉◯]) Claude Code\b/gu)].at(-1)?.[1];
  if (mark === undefined) throw new Error(`No Claude Code row in frame:\n${frame}`);
  return mark;
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
    expect(result.transcript).not.toMatch(/✔ {3}Apply changes {2,}details/u);
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
    expect(result.exitCode, result.transcript).toBe(0);
    expect(workspace.settings()).toMatchObject({ skills: { review: "workspace" } });
    expect(workspace.authoredSkillExists()).toBe(true);
    expect(result.rawModeRestored, "raw mode was not handed back").toBe(true);
    expect(result.cursorRestored, "the cursor was left hidden").toBe(true);
  });

  it("keeps the confirmable plan visible when quiet suppresses the live region", async () => {
    const workspace = gateWorkspace();

    const result = await runCliUnderPty([...demote, "--quiet"], {
      home: workspace.home,
      cwd: workspace.cwd,
      columns: 100,
      rows: 30,
      env: { ...gateEnv, NO_COLOR: "" },
      actions: [{ awaiting: "Apply changes?" }, { send: "n" }],
    });

    const [opened] = result.actions;
    expect(opened?.matched, result.transcript).toBe(true);
    expect(result.transcript).toContain("The workspace-authored package will be replaced");
    expect(result.exitCode, result.transcript).toBe(0);
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

    // Printable text narrows the list, typed after the question.
    expect(filtered?.emitted).toContain("Select agents to configure  clau");
    expect(filtered?.emitted).toContain("Claude Code");
    expect(filtered?.emitted).toMatch(/\d+ of \d+ shown · esc clears the filter/u);

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

describe.skipIf(!ptyIsSupported)("setup's instructions source under a pseudo-terminal", () => {
  it("chooses from a list, refuses a bad file name, and writes nothing when declined", async () => {
    const cwd = tempDir("axm-pty-workspace-");
    const refused = "/abs.md";

    const result = await runCliUnderPty(["setup", "--scope", "project"], {
      home: tempDir("axm-pty-home-"),
      cwd,
      columns: 100,
      rows: 30,
      actions: [
        { awaiting: "Select agents to configure" },
        { send: "clau" },
        { send: Keys.space },
        { send: Keys.enter },
        { awaiting: "Sync instructions to the selected agents?" },
        { send: "y" },
        { awaiting: "Instructions source" },
        // The caret stops at the last option, so pressing past it lands there.
        ...Array.from({ length: 8 }, () => ({ send: Keys.down })),
        { send: Keys.enter },
        { awaiting: "Instructions file name" },
        { send: refused },
        { send: Keys.enter },
        { awaiting: "Enter a path relative to the project root." },
        ...Array.from({ length: refused.length }, () => ({ send: Keys.backspace })),
        { send: "docs/AGENTS.md" },
        { send: Keys.enter },
        { awaiting: "Apply setup?" },
        { send: "n" },
      ],
    });

    for (const outcome of result.actions) {
      expect(outcome.matched, `${JSON.stringify(outcome.action)}\n${result.transcript}`).toBe(true);
    }
    // The agent pick left one line naming what was picked.
    expect(result.transcript).toMatch(/✔ {3}Agents +\S/u);
    // The list opens under its question with the caret on the recommended
    // file, the caret moves with the arrows, and another file comes last.
    expect(result.transcript).toMatch(/❯ {3}AGENTS\.md +recommended/u);
    expect(result.transcript).toMatch(/❯ {3}CLAUDE\.md/u);
    expect(result.transcript).toMatch(/Other… +type a file name/u);
    // A refused name stays open with the reason in the attention mark.
    expect(result.transcript).toContain("▲   Enter a path relative to the project root.");
    // Each answered question leaves one line, and the refused name left none.
    expect(result.transcript).toMatch(/✔ {3}Instructions source +Other…/u);
    expect(result.transcript).toMatch(/✔ {3}Instructions file name +docs\/AGENTS\.md/u);
    expect(result.transcript).not.toMatch(/✔ {3}Instructions file name +\/abs\.md/u);

    // Setup opens with its title line, not a logo, and gates on a plan ledger.
    expect(result.transcript).toContain("Setting up AXM in");
    expect(result.transcript).toMatch(/Target +Plan +Detail/u);
    expect(result.transcript).toMatch(/ {3}docs\/AGENTS\.md +\S/u);

    // Declining the plan writes nothing, says so, and the terminal comes back.
    expect(result.transcript).toMatch(/Apply setup +no/u);
    expect(result.transcript).toMatch(/Setup cancelled +nothing was changed/u);
    expect(result.timedOut, result.transcript).toBe(false);
    expect(fs.existsSync(path.join(cwd, "axm.json"))).toBe(false);
    expect(result.rawModeRestored, "raw mode was not handed back").toBe(true);
    expect(result.cursorRestored, "the cursor was left hidden").toBe(true);
  });
});

/**
 * A Registry whose device authorization never completes, so a wait on it
 * stands open until the person watching it does something. Nothing here opens
 * a browser or touches the clipboard: the sign-in is started by a separate
 * machine-mode invocation, and the bounded wait only resumes it.
 */
const startPendingDeviceAuthServer = async () => {
  const sendJson = (response: http.ServerResponse, status: number, body: unknown) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const address = server.address();
    if (address === null || typeof address === "string") {
      sendJson(response, 500, { error: "server_address_unavailable" });
      return;
    }
    if (request.method === "POST" && pathname === "/v1/auth/device/code") {
      const verificationUri = `http://127.0.0.1:${String(address.port)}/device`;
      sendJson(response, 200, {
        device_code: "device-secret",
        user_code: "ABCD-1234",
        verification_uri: verificationUri,
        verification_uri_complete: `${verificationUri}?user_code=ABCD-1234`,
        interval: 1,
        expires_in: 600,
      });
      return;
    }
    if (request.method === "POST" && pathname === "/v1/auth/token") {
      sendJson(response, 400, {
        kind: "TokenOAuthError",
        error: "authorization_pending",
        error_description: "authorization_pending",
      });
      return;
    }
    sendJson(response, 404, { error: "not_found" });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected TCP address");
  return {
    url: `http://127.0.0.1:${String(address.port)}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
};

describe.skipIf(!ptyIsSupported)("a wait under a pseudo-terminal", () => {
  it("shows the countdown and its keys, and hands the terminal back when it is stopped", async () => {
    const auth = await startPendingDeviceAuthServer();
    const home = tempDir("axm-pty-home-");
    const cwd = tempDir("axm-pty-workspace-");
    const env = {
      AXM_NO_UPDATE_CHECK: "1",
      AXM_REGISTRY_URL: auth.url,
      AXM_REGISTRY_LOCATION: auth.url,
      // A wait only counts down and takes keys where the region animates, and
      // this suite otherwise keeps NO_COLOR for a stable transcript.
      NO_COLOR: "",
    };

    try {
      const started = await runCli(["login", "--device-code", "--json", "--non-interactive"], {
        env: { HOME: home, AXM_USER_HOME: home, ...env, NO_COLOR: "1" },
      });
      expect(started.exitCode, started.stdout + started.stderr).toBe(0);

      const result = await runCliUnderPty(["login", "--device-code", "--wait-for-human", "300"], {
        home,
        cwd,
        columns: 100,
        rows: 30,
        env,
        actions: [{ awaiting: "Waiting for approval" }, { send: Keys.escape }],
      });

      const [opened] = result.actions;
      expect(opened?.matched, result.transcript).toBe(true);
      // The brief printed the code and the page once; only the countdown and
      // its keys repaint beneath it.
      expect(result.transcript).toContain("One-time code: ABCD-1234");
      expect(result.transcript).toContain(`${auth.url}/device?user_code=ABCD-1234`);
      expect(opened?.emitted).toContain("left");
      expect(opened?.emitted).toContain("o  open");
      expect(opened?.emitted).toContain("c  copy");
      expect(opened?.emitted).toContain("esc  stop");

      // Stopping the wait leaves the sign-in itself untouched and names the
      // command that resumes it.
      expect(result.timedOut, result.transcript).toBe(false);
      expect(result.exitCode, result.transcript).toBe(16);
      expect(result.transcript).toContain("axm login --device-code --wait-for-human 300");
      expect(result.rawModeRestored, "raw mode was not handed back").toBe(true);
      expect(result.cursorRestored, "the cursor was left hidden").toBe(true);
    } finally {
      await auth.close();
    }
  });
});
