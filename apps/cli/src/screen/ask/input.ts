/**
 * The `Input` kind: one typed line, checked before it is accepted.
 *
 * The line is typed behind the caret on the question's own line. `enter`
 * submits it through the question's pure `validate`; a line it refuses stays
 * open with the reason beneath it in the gutter's attention mark, and the
 * next edit clears the reason. Neither the reducer nor the view touches the
 * terminal.
 */

import * as Result from "effect/Result";

import type { CalloutNode, Doc } from "../doc.js";
import {
  isQuitKey,
  isSubmitKey,
  answerDoc,
  promptNode,
  typedText,
  type AskKey,
  type AskKind,
  type AskReducerAction,
  type InputAsk,
} from "./ask.js";

/** The line typed so far, and what was wrong with it when it was last submitted. */
export interface InputState {
  readonly raw: string;
  readonly problem?: string;
}

export type InputAction<A> = AskReducerAction<
  InputState,
  { readonly value: A; readonly raw: string }
>;

export const initialInputState: InputState = { raw: "" };

/**
 * One key against one line. Text appends, backspace removes the last
 * character, `enter` submits through `validate`, and escape and an interrupt
 * cancel. A refused line keeps what was typed so the person can fix it.
 */
export const reduceInput = <A>(
  ask: InputAsk<A>,
  state: InputState,
  key: AskKey,
): InputAction<A> => {
  if (isQuitKey(key) || key.name === "escape") return { _tag: "Cancel" };
  if (isSubmitKey(key)) {
    return Result.match(ask.validate(state.raw), {
      onSuccess: (value): InputAction<A> => ({
        _tag: "Submit",
        submission: { value, raw: state.raw },
      }),
      onFailure: (problem): InputAction<A> => ({
        _tag: "Next",
        state: { raw: state.raw, problem },
      }),
    });
  }
  if (key.name === "backspace") {
    return { _tag: "Next", state: { raw: [...state.raw].slice(0, -1).join("") } };
  }
  const typed = typedText(key);
  return typed === undefined
    ? { _tag: "Next", state }
    : { _tag: "Next", state: { raw: `${state.raw}${typed}` } };
};

/** The question as the live scene shows it while it stands open. */
export const inputDoc = <A>(ask: InputAsk<A>, state: InputState): Doc => [
  promptNode(ask, {
    chips: [],
    entry:
      state.raw.length === 0 && ask.placeholder !== undefined
        ? [{ text: ask.placeholder, tone: "dim" }]
        : state.raw,
  }),
  ...(state.problem === undefined
    ? []
    : [{ _tag: "callout", tone: "warn", title: state.problem } satisfies CalloutNode]),
];

/** The one transcript line an answered input leaves behind: what was typed. */
export const inputAnswer = <A>(ask: InputAsk<A>, raw: string): Doc => answerDoc(ask, raw);

/** An `Input` as the `Screen` runs it. */
export const inputKind = <A>(ask: InputAsk<A>): AskKind<InputState, A> => ({
  initial: initialInputState,
  reduce: (state, key) => {
    const action = reduceInput(ask, state, key);
    return action._tag === "Submit"
      ? {
          _tag: "Submit",
          value: action.submission.value,
          answer: inputAnswer(ask, action.submission.raw),
        }
      : action;
  },
  view: (state) => inputDoc(ask, state),
});
