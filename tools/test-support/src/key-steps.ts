/**
 * The one key-step grammar terminal work is driven with.
 *
 * A step script drives a prompt either in a real pseudo-terminal, where a key
 * is the bytes a terminal writes, or in process, where it is the key Node's
 * readline decodes those bytes as. Each key is defined here once with both
 * readings, so the two runners accept the same scripts and press the same keys.
 *
 * Steps are separated by commas. `await:<text>` waits until the terminal shows
 * the text, `type:<text>` types it one character at a time,
 * `size:<columns>x<rows>` resizes the terminal, and any other step is a key by
 * name, optionally repeated: `down*3`.
 */
import * as Option from "effect/Option";
import * as Result from "effect/Result";

/** One key as a terminal sends it and as Node's readline decodes it. */
export interface TerminalKey {
  /** The bytes a terminal writes for the key. */
  readonly sequence: string;
  /** The name readline gives the key. */
  readonly name: string;
  /** Whether readline reports the control modifier. */
  readonly ctrl: boolean;
  /** The text readline reports with the key; absent for an escape sequence. */
  readonly char?: string;
}

const ESCAPE = "\u001B";

const terminalKey = (sequence: string, name: string, ctrl = false): TerminalKey => ({
  sequence,
  name,
  ctrl,
  // readline reports no text with a sequence that begins with escape.
  ...(sequence.startsWith(ESCAPE) ? {} : { char: sequence }),
});

/** The control key readline names by its letter, such as `ctrl`+`c`. */
const controlKey = (letter: string): TerminalKey =>
  terminalKey(String.fromCharCode(letter.charCodeAt(0) - 0x60), letter, true);

/** Keys a terminal sends; a pseudo-terminal test writes their `sequence`. */
export const Keys = {
  up: terminalKey(`${ESCAPE}[A`, "up"),
  down: terminalKey(`${ESCAPE}[B`, "down"),
  right: terminalKey(`${ESCAPE}[C`, "right"),
  left: terminalKey(`${ESCAPE}[D`, "left"),
  pageUp: terminalKey(`${ESCAPE}[5~`, "pageup"),
  pageDown: terminalKey(`${ESCAPE}[6~`, "pagedown"),
  home: terminalKey(`${ESCAPE}[H`, "home"),
  end: terminalKey(`${ESCAPE}[F`, "end"),
  space: terminalKey(" ", "space"),
  enter: terminalKey("\r", "return"),
  tab: terminalKey("\t", "tab"),
  backspace: terminalKey("\u007F", "backspace"),
  escape: terminalKey(ESCAPE, "escape"),
  /** Ctrl-C. Raw mode suppresses SIGINT, so this arrives as a byte. */
  interrupt: controlKey("c"),
} satisfies Readonly<Record<string, TerminalKey>>;

/** The key a step names, by every name a step may use for it. */
const stepKeys: Readonly<Record<string, TerminalKey>> = {
  ...Keys,
  esc: Keys.escape,
  pageup: Keys.pageUp,
  pagedown: Keys.pageDown,
  "ctrl+a": controlKey("a"),
  "ctrl+c": Keys.interrupt,
  "ctrl+u": controlKey("u"),
};

/** The key names a step may use, for a message that lists them. */
const stepKeyNames: ReadonlyArray<string> = Object.keys(stepKeys).sort();

/** The key typing one character presses, named as readline names it. */
const typedKey = (character: string): TerminalKey =>
  character === " "
    ? Keys.space
    : terminalKey(character, /^[0-9A-Za-z]$/u.test(character) ? character.toLowerCase() : "");

export interface TerminalSize {
  readonly columns: number;
  readonly rows: number;
}

/** One step of a script, in the order it runs. */
export type KeyStep =
  | { readonly _tag: "Await"; readonly text: string }
  /** `label` is how the step names the key, for a heading over its frame. */
  | { readonly _tag: "Press"; readonly key: TerminalKey; readonly label: string }
  | { readonly _tag: "Resize"; readonly size: TerminalSize };

/** A terminal written as columns by rows, such as `80x24`. */
export const parseTerminalSize = (text: string): Option.Option<TerminalSize> => {
  const [columns, rows, ...rest] = text.split("x").map(Number);
  return columns === undefined ||
    rows === undefined ||
    rest.length > 0 ||
    !Number.isInteger(columns) ||
    !Number.isInteger(rows) ||
    columns < 1 ||
    rows < 1
    ? Option.none()
    : Option.some({ columns, rows });
};

const keyStep = (step: string): Result.Result<ReadonlyArray<KeyStep>, string> => {
  const [name = "", times = "1", ...rest] = step.split("*");
  const count = Number(times);
  const key = Object.hasOwn(stepKeys, name) ? stepKeys[name] : undefined;
  if (key === undefined)
    return Result.fail(`Unknown step "${step}". Keys: ${stepKeyNames.join(", ")}.`);
  if (rest.length > 0 || !Number.isInteger(count) || count < 1)
    return Result.fail(`"${step}" repeats a key a whole number of times, such as ${name}*3.`);
  return Result.succeed(
    Array.from({ length: count }, (): KeyStep => ({ _tag: "Press", key, label: name })),
  );
};

const parseStep = (step: string): Result.Result<ReadonlyArray<KeyStep>, string> => {
  if (step.startsWith("await:")) return Result.succeed([{ _tag: "Await", text: step.slice(6) }]);
  if (step.startsWith("type:"))
    return Result.succeed(
      [...step.slice(5)].map((character): KeyStep => ({
        _tag: "Press",
        key: typedKey(character),
        label: `type ${JSON.stringify(character)}`,
      })),
    );
  if (step.startsWith("size:"))
    return Option.match(parseTerminalSize(step.slice(5)), {
      onNone: () =>
        Result.fail(`"${step}" names a terminal as columns by rows, such as size:80x24.`),
      onSome: (size) => Result.succeed([{ _tag: "Resize", size }]),
    });
  return keyStep(step);
};

/** The steps a script names, or what is wrong with its first bad step. */
export const parseKeySteps = (script: string): Result.Result<ReadonlyArray<KeyStep>, string> => {
  const steps: Array<KeyStep> = [];
  for (const step of script.split(",").filter((part) => part.length > 0)) {
    const parsed = parseStep(step);
    if (Result.isFailure(parsed)) return parsed;
    steps.push(...parsed.success);
  }
  return Result.succeed(steps);
};

/** A step as a heading over the frame it produced. */
export const describeKeyStep = (step: KeyStep): string => {
  switch (step._tag) {
    case "Await":
      return `await ${JSON.stringify(step.text)}`;
    case "Press":
      return step.label;
    case "Resize":
      return `size ${String(step.size.columns)}x${String(step.size.rows)}`;
  }
};
