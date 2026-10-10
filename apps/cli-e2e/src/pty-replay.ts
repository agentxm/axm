/**
 * Headless terminal replay for the pseudo-terminal harness.
 *
 * A PTY run reports the exact bytes the subject wrote. Stripping their escape
 * sequences would count erased text as retained, so the bytes are interpreted
 * by a terminal instead: what comes back is the buffer a person would see,
 * scrollback included.
 */
import { Terminal } from "@xterm/headless";

import type { PtyRunResult } from "./pty.js";

const write = (terminal: Terminal, bytes: string): Promise<void> =>
  new Promise((resolve) => {
    terminal.write(bytes, resolve);
  });

const bufferText = (terminal: Terminal): string => {
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
};

/**
 * The terminal's buffer after each action of a run, in order, and after
 * everything the subject wrote once the last action had settled.
 */
export const replayFrames = async (
  result: PtyRunResult,
  columns: number,
  rows: number,
): Promise<{ readonly afterActions: ReadonlyArray<string>; readonly final: string }> => {
  const terminal = new Terminal({
    cols: columns,
    rows,
    scrollback: 10_000,
    allowProposedApi: true,
  });
  try {
    let consumed = 0;
    const afterActions: Array<string> = [];
    for (const step of result.actions) {
      if ("resize" in step.action)
        terminal.resize(step.action.resize.columns, step.action.resize.rows);
      await write(terminal, step.bytes);
      consumed += step.bytes.length;
      afterActions.push(bufferText(terminal));
    }
    await write(terminal, result.output.slice(consumed));
    return { afterActions, final: bufferText(terminal) };
  } finally {
    terminal.dispose();
  }
};

/** The terminal's buffer once a run is over. */
export const replay = async (result: PtyRunResult, columns: number, rows: number) =>
  (await replayFrames(result, columns, rows)).final;
