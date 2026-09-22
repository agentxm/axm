import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Terminal } from "@xterm/headless";
import { describe, expect, it } from "vitest";
import { Keys, ptyIsSupported, runUnderPty, type PtyRunResult } from "./pty.js";

const fixturePath = fileURLToPath(new URL("./fixtures/screen-log-frame.mjs", import.meta.url));
const subject = { runtime: "bun-script", path: fixturePath } as const;
const env = {
  PATH: process.env["PATH"] ?? "/usr/bin:/bin",
  TERM: "xterm-256color",
  CI: "",
  NO_COLOR: "1",
};
const write = (terminal: Terminal, bytes: string) =>
  new Promise<void>((resolve) => terminal.write(bytes, resolve));

/** Replay the actual PTY bytes, including resize points, into screen and scrollback. */
const replay = async (result: PtyRunResult, columns: number, rows: number) => {
  const terminal = new Terminal({
    cols: columns,
    rows,
    scrollback: 10_000,
    allowProposedApi: true,
  });
  try {
    let consumed = 0;
    for (const step of result.actions) {
      if ("resize" in step.action)
        terminal.resize(step.action.resize.columns, step.action.resize.rows);
      await write(terminal, step.bytes);
      consumed += step.bytes.length;
    }
    await write(terminal, result.output.slice(consumed));
    const buffer = terminal.buffer.active;
    const lines: Array<string> = [];
    for (let index = 0; index < buffer.length; index += 1) {
      const line = buffer.getLine(index);
      if (line === undefined) continue;
      const text = line.translateToString(true);
      if (line.isWrapped && lines.length > 0) lines[lines.length - 1] += text;
      else lines.push(text);
    }
    return lines.join("\n");
  } finally {
    terminal.dispose();
  }
};

const expectHistory = (text: string) => {
  const normalized = text.replace(/\s+/gu, " ");
  let previous = -1;
  for (let index = 0; index < 16; index += 1) {
    const position = normalized.indexOf(`Committed context ${index}`);
    expect(position, normalized).toBeGreaterThan(previous);
    previous = position;
  }
  expect(normalized).toContain("warning stayed whole");
  expect(normalized).toContain("Finished resolving sources");
  expect(normalized).toContain("Frame result complete");
};

describe("screen output through pipes", () => {
  it("keeps primary stdout separate and narrates without terminal controls", () => {
    const result = spawnSync("bun", ["run", fixturePath, "plain"], { encoding: "utf8", env });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Frame result complete");
    expect(result.stderr).not.toContain("\u001b");
    expectHistory(result.stderr + result.stdout);
  });
});

describe.skipIf(!ptyIsSupported)("screen history under a real pseudo-terminal", () => {
  for (const [columns, rows] of [
    [20, 4],
    [40, 16],
    [80, 24],
    [100, 16],
    [120, 24],
    [200, 4],
  ] as const) {
    it(`preserves history at ${columns} by ${rows}`, async () => {
      const result = await runUnderPty(subject, [], { columns, rows, env });
      expect(result.exitCode, result.transcript).toBe(0);
      expect(result.output).toContain("\u001b[?25l");
      expect(result.cursorRestored).toBe(true);
      expect(result.rawModeRestored).toBe(true);
      expectHistory(await replay(result, columns, rows));
    });
  }

  for (const size of [
    { columns: 20, rows: 4 },
    { columns: 1, rows: 1 },
  ]) {
    it(`preserves history and hands back input after resize to ${size.columns} by ${size.rows}`, async () => {
      const usable = size.columns >= 20;
      const result = await runUnderPty(subject, ["question"], {
        columns: 100,
        rows: 24,
        env,
        actions: [
          { awaiting: "Keep these changes?" },
          { resize: size },
          ...(usable ? [{ send: Keys.enter }] : []),
        ],
      });
      expect(
        result.actions.every((step) => step.matched),
        result.transcript,
      ).toBe(true);
      expect(result.exitCode, result.transcript).toBe(0);
      expect(result.rawModeRestored).toBe(true);
      expect(result.cursorRestored).toBe(true);
      const text = await replay(result, 100, 24);
      expectHistory(text);
      expect(text.replace(/\s+/gu, " ")).toContain("Keep these changes?");
      expect(text.replace(/\s+/gu, " ")).toContain(usable ? "Changes yes" : "Changes: cancelled");
    });
  }
});
