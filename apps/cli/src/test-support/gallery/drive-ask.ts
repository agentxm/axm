/**
 * A question driven in process by a key-step script.
 *
 * Each key goes through the question's own reducer, and each state is painted
 * the way the live region paints the question's controls, so a prompt can be
 * looked at between keys without a terminal. The context `runAsk` commits to
 * the transcript before the controls is not painted. The script is the shared
 * key-step grammar the pseudo-terminal preview runs; a wait needs a running
 * CLI to wait on, so it is refused here, while a resize repaints the same
 * state in the new space.
 */

import * as Result from "effect/Result";

import {
  describeKeyStep,
  parseKeySteps,
  type KeyStep,
  type TerminalKey,
} from "@agentxm/test-support/key-steps";

import type { Ask, AskKey, AskKind } from "../../screen/ask/ask.js";
import { liveAskView, withAskKind } from "../../screen/ask/run.js";
import { unicodeGlyphs } from "../../screen/glyphs.js";
import { paintText, type PaintStyle } from "../../screen/paint-text.js";
import { paintScene, type TerminalSize } from "../../screen/scene.js";

/** The key a reducer sees for one the grammar names, as the CLI's terminal decodes it. */
const askKeyOf = ({ name, ctrl, char }: TerminalKey): AskKey => ({
  name,
  ctrl,
  ...(char === undefined ? {} : { char }),
});

/**
 * The keys a script presses, for a fixture that holds a question in the state
 * they leave it. A script with a wait, a resize, or a step the grammar cannot
 * read is a broken fixture rather than a state.
 */
export const askKeys = (script: string): ReadonlyArray<AskKey> => {
  const steps = parseKeySteps(script);
  if (Result.isFailure(steps)) throw new Error(`Invalid key script: ${steps.failure}`);
  return steps.success.map((step) => {
    if (step._tag !== "Press")
      throw new Error(`Invalid key script: ${describeKeyStep(step)} presses no key.`);
    return askKeyOf(step.key);
  });
};

/** One painted state, and the step that led to it; the opening state has none. */
interface AskFrame {
  readonly after: KeyStep | undefined;
  readonly lines: ReadonlyArray<string>;
}

/** Where the script left the question. */
type AskEnding =
  | { readonly _tag: "Open" }
  | {
      readonly _tag: "Submitted";
      readonly value: unknown;
      /** The transcript line the answer leaves, painted. */
      readonly answer: ReadonlyArray<string>;
    }
  | { readonly _tag: "Cancelled" };

export interface AskRun {
  readonly frames: ReadonlyArray<AskFrame>;
  readonly ending: AskEnding;
}

type DriveStyle = Omit<PaintStyle, "width">;

const driveKind = <S, A>(
  ask: Ask<A>,
  kind: AskKind<S, A>,
  steps: ReadonlyArray<KeyStep>,
  terminal: TerminalSize,
  style: DriveStyle,
): Result.Result<AskRun, string> => {
  const view = liveAskView(ask, kind);
  const paint = (state: S, size: TerminalSize) =>
    paintScene({ interaction: (facts) => view(state, facts) }, size, {
      ...style,
      // A still frame paints the running mark's first frame.
      spinner: (style.glyphs ?? unicodeGlyphs).spinner[0] ?? "",
      nowMs: 0,
    });
  let state = kind.initial;
  let size = terminal;
  const frames: Array<AskFrame> = [{ after: undefined, lines: paint(state, size) }];
  for (const [index, step] of steps.entries()) {
    if (step._tag === "Await")
      return Result.fail(
        `${describeKeyStep(step)} waits on a running CLI; drive one with \`pnpm lab run\`.`,
      );
    if (step._tag === "Resize") {
      size = step.size;
      frames.push({ after: step, lines: paint(state, size) });
      continue;
    }
    const action = kind.reduce(state, askKeyOf(step.key));
    if (action._tag === "Next") {
      state = action.state;
      frames.push({ after: step, lines: paint(state, size) });
      continue;
    }
    const left = steps.length - index - 1;
    if (left > 0)
      return Result.fail(
        `The question settled at step ${String(index + 1)} (${describeKeyStep(step)}) with ${String(left)} more to run.`,
      );
    return Result.succeed({
      frames,
      ending:
        action._tag === "Submit"
          ? {
              _tag: "Submitted",
              value: action.value,
              answer: paintText(action.answer, { ...style, width: size.columns }),
            }
          : { _tag: "Cancelled" },
    });
  }
  return Result.succeed({ frames, ending: { _tag: "Open" } });
};

/**
 * Drive `ask` through `steps` in a terminal of the given size: every state it
 * passes through painted, and how it ended. A wait, or a step after the
 * question has settled, is what is wrong with the script.
 */
export const driveAsk = <A>(
  ask: Ask<A>,
  steps: ReadonlyArray<KeyStep>,
  terminal: TerminalSize,
  style: DriveStyle,
): Result.Result<AskRun, string> =>
  withAskKind(ask, (kind) => driveKind(ask, kind, steps, terminal, style));
