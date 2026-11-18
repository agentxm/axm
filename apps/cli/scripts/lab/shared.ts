/**
 * What every lab command shares: the terminal it runs in, the one `--size`
 * flag, the paint style, and how a command says what is wrong.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Terminal from "effect/Terminal";
import { CliError, Flag } from "effect/cli";

import { parseTerminalSize } from "@agentxm/test-support/key-steps";

import { asciiGlyphs, unicodeGlyphs, type Glyphs } from "../../src/screen/glyphs.js";
import { resolveCliOutputPolicy } from "../../src/screen/output-policy.js";
import type { TerminalSize } from "../../src/screen/scene.js";

/** The terminal this runs in, or 80 by 24 where the output is not a terminal. */
const currentTerminal: Effect.Effect<TerminalSize, never, Terminal.Terminal> = Effect.gen(
  function* () {
    const terminal = yield* Terminal.Terminal;
    const columns = yield* terminal.columns;
    const rows = yield* terminal.rows;
    return { columns: columns > 0 ? columns : 80, rows: rows > 0 ? rows : 24 };
  },
);

/** A size as `--size` names it: columns by rows, or columns alone. */
type SizeRequest = { readonly columns: number; readonly rows: number | undefined };

const parseSize = (text: string): Option.Option<SizeRequest> => {
  if (/^[1-9][0-9]*$/u.test(text)) return Option.some({ columns: Number(text), rows: undefined });
  return parseTerminalSize(text);
};

/**
 * The one size flag every lab command takes: `80x24`, or `80` to keep the
 * terminal's own height. Without it a command paints at the terminal's size.
 */
export const sizeFlag = Flag.String("size").pipe(
  Flag.withDescription(
    "The terminal to paint for, as columns by rows (80x24) or columns alone (80); the current terminal by default",
  ),
  Flag.filterMap(
    parseSize,
    (value) => `--size names a terminal as columns by rows (80x24) or columns (80), not ${value}.`,
  ),
  Flag.optional,
);

/** The size a command paints at: what `--size` names, filled in from the current terminal. */
export const resolveSize = (
  requested: Option.Option<SizeRequest>,
): Effect.Effect<TerminalSize, never, Terminal.Terminal> =>
  Effect.map(currentTerminal, (terminal) =>
    Option.match(requested, {
      onNone: () => terminal,
      onSome: (size) => ({ columns: size.columns, rows: size.rows ?? terminal.rows }),
    }),
  );

export const styleFlags = {
  ascii: Flag.Boolean("ascii").pipe(
    Flag.withDescription("Paint with seven-bit ASCII glyphs"),
    Flag.withDefault(false),
  ),
  plain: Flag.Boolean("plain").pipe(
    Flag.withDescription("Paint without colour"),
    Flag.withDefault(false),
  ),
};

export interface LabStyle {
  readonly colors: boolean;
  readonly glyphs: Glyphs;
}

/** The paint style the terminal's own policy chooses, less what the flags turn off. */
export const paintStyle = (flags: {
  readonly ascii: boolean;
  readonly plain: boolean;
}): LabStyle => {
  const policy = resolveCliOutputPolicy();
  return {
    colors: policy.stdoutColors && !flags.plain,
    glyphs: flags.ascii || policy.glyphs === "ascii" ? asciiGlyphs : unicodeGlyphs,
  };
};

export const userError = (message: string) =>
  new CliError.UserError({ cause: new Error(message), userMessage: message });
