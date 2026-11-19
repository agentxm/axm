/**
 * Headless terminal replay for screen evidence.
 *
 * Stripping escape sequences from captured bytes would count erased text as
 * retained, so the bytes are interpreted by a terminal instead: what comes
 * back is the buffer a person would see, scrollback included, with lines the
 * terminal wrapped joined back into the logical lines that were written.
 */
import { Terminal } from "@xterm/headless";
import * as Effect from "effect/Effect";

export interface TerminalReplayOptions {
  readonly columns?: number;
  readonly rows?: number;
  /**
   * Whether a bare line feed also returns the carriage. In-memory stream
   * doubles bypass the pseudo-terminal's ONLCR translation and need it; bytes
   * captured from a real pseudo-terminal already carry that translation.
   */
  readonly convertEol: boolean;
}

/** A scoped terminal of the given size that is disposed when its scope closes. */
export const makeTerminalReplay = ({
  columns = 80,
  rows = 24,
  convertEol,
}: TerminalReplayOptions) =>
  Effect.acquireRelease(
    Effect.sync(
      () =>
        new Terminal({
          cols: columns,
          rows,
          scrollback: 10_000,
          allowProposedApi: true,
          convertEol,
        }),
    ),
    (terminal) => Effect.sync(() => terminal.dispose()),
  );

/** Interpret bytes, completing once the terminal has parsed all of them. */
export const replayBytes = (terminal: Terminal, bytes: string) =>
  Effect.callback<void>((resume) => {
    terminal.write(bytes, () => resume(Effect.void));
  });

export const resizeTerminal = (terminal: Terminal, columns: number, rows: number) =>
  Effect.sync(() => terminal.resize(columns, rows));

/** Logical lines that survive terminal-owned wrapping and scrollback, without trailing blank space. */
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
