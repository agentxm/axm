/**
 * The step script the terminal preview takes on its command line, as the
 * actions the pseudo-terminal harness replays.
 *
 * Steps are separated by commas. `await:<text>` waits until the terminal shows
 * the text, `type:<text>` types it one character at a time, `size:<columns>x<rows>`
 * resizes the terminal, and any other step is a key by name, optionally
 * repeated: `down*3`.
 */
import * as Result from "effect/Result";

import { Keys, type PtyAction } from "./pty.js";

const namedKeys: Readonly<Record<string, string>> = {
  ...Keys,
  esc: Keys.escape,
  pageup: Keys.pageUp,
  pagedown: Keys.pageDown,
  "ctrl+a": "\u0001",
  "ctrl+c": Keys.interrupt,
  "ctrl+u": "\u0015",
};

/** The key names a step may use, for a message that lists them. */
export const stepKeyNames: ReadonlyArray<string> = Object.keys(namedKeys).sort();

const keyStep = (step: string): Result.Result<ReadonlyArray<PtyAction>, string> => {
  const [name = "", times = "1", ...rest] = step.split("*");
  const count = Number(times);
  const sequence = Object.hasOwn(namedKeys, name) ? namedKeys[name] : undefined;
  if (sequence === undefined)
    return Result.fail(`Unknown step "${step}". Keys: ${stepKeyNames.join(", ")}.`);
  if (rest.length > 0 || !Number.isInteger(count) || count < 1)
    return Result.fail(`"${step}" repeats a key a whole number of times, such as ${name}*3.`);
  return Result.succeed(Array.from({ length: count }, () => ({ send: sequence })));
};

const sizeStep = (size: string): Result.Result<ReadonlyArray<PtyAction>, string> => {
  const [columns, rows, ...rest] = size.split("x").map(Number);
  return columns === undefined ||
    rows === undefined ||
    rest.length > 0 ||
    !Number.isInteger(columns) ||
    !Number.isInteger(rows) ||
    columns < 1 ||
    rows < 1
    ? Result.fail(`"size:${size}" names a terminal as columns by rows, such as size:80x24.`)
    : Result.succeed([{ resize: { columns, rows } }]);
};

const parseStep = (step: string): Result.Result<ReadonlyArray<PtyAction>, string> => {
  if (step.startsWith("await:")) return Result.succeed([{ awaiting: step.slice(6) }]);
  if (step.startsWith("type:"))
    return Result.succeed([...step.slice(5)].map((character) => ({ send: character })));
  if (step.startsWith("size:")) return sizeStep(step.slice(5));
  return keyStep(step);
};

/** The actions a step script names, or what is wrong with its first bad step. */
export const parseSteps = (script: string): Result.Result<ReadonlyArray<PtyAction>, string> => {
  const actions: Array<PtyAction> = [];
  for (const step of script.split(",").filter((part) => part.length > 0)) {
    const parsed = parseStep(step);
    if (Result.isFailure(parsed)) return parsed;
    actions.push(...parsed.success);
  }
  return Result.succeed(actions);
};
