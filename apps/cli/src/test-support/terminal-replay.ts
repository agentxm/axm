import { Terminal } from "@xterm/headless";
import * as Effect from "effect/Effect";

/** Interpret control bytes rather than treating erased text as retained history. */
export const makeTerminalReplay = (columns = 80, rows = 24) =>
  Effect.acquireRelease(
    Effect.sync(
      () =>
        new Terminal({
          cols: columns,
          rows,
          scrollback: 10_000,
          allowProposedApi: true,
          // In-memory stream doubles bypass the PTY's ONLCR translation.
          convertEol: true,
        }),
    ),
    (terminal) => Effect.sync(() => terminal.dispose()),
  );

export const replayBytes = (terminal: Terminal, bytes: string) =>
  Effect.callback<void>((resume) => {
    terminal.write(bytes, () => resume(Effect.void));
  });

/** Logical lines survive terminal-owned wrapping and scrollback. */
export const terminalTranscript = (terminal: Terminal): string => {
  const buffer = terminal.buffer.active;
  const lines: Array<string> = [];
  for (let index = 0; index < buffer.length; index += 1) {
    const line = buffer.getLine(index);
    if (line === undefined) continue;
    const content = line.translateToString(true);
    if (line.isWrapped && lines.length > 0) {
      lines[lines.length - 1] += content;
    } else lines.push(content);
  }
  return lines.join("\n").trimEnd();
};
