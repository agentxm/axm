/**
 * The `Confirm` kind: a question answered by one lettered key.
 *
 * A reducer takes a key and answers with the next state, a submission, or a
 * cancellation; a view takes that state to a document. Neither touches the
 * terminal, so both are ordinary pure functions. The choice `enter` takes is
 * shown by a filled chip and by its capital letter, so the default survives a
 * terminal without color; risk flips which choice comes first, and nothing
 * else about the question changes.
 */

import type { Doc, PromptChip } from "../doc.js";
import {
  isQuitKey,
  isSubmitKey,
  answerDoc,
  promptNode,
  type AskKey,
  type AskKind,
  type AskReducerAction,
  type ConfirmAsk,
  type ConfirmChoice,
} from "./ask.js";

/** Which choice `enter` takes. */
export interface ConfirmState {
  readonly index: number;
}

export type ConfirmAction<A> = AskReducerAction<ConfirmState, ConfirmChoice<A>>;

/** The question opens on its default, which is its first choice. */
export const initialConfirmState: ConfirmState = { index: 0 };

const at = <A>(ask: ConfirmAsk<A>, index: number): ConfirmChoice<A> | undefined =>
  ask.choices[index];

const moved = <A>(ask: ConfirmAsk<A>, index: number, step: number): ConfirmAction<A> => {
  const count = ask.choices.length;
  return {
    _tag: "Next",
    state: { index: count === 0 ? 0 : (index + step + count) % count },
  };
};

const matching = <A>(
  ask: ConfirmAsk<A>,
  typed: string | undefined,
): ConfirmChoice<A> | undefined =>
  typed === undefined || typed.length === 0
    ? undefined
    : ask.choices.find((choice) => choice.key.toLowerCase() === typed.toLowerCase());

/**
 * One key against one question. A choice's own key answers it outright; the
 * arrows and tab move which choice `enter` would take; escape and an interrupt
 * cancel. Any other key leaves the question exactly as it stood, because a
 * mistyped letter is not an answer and has nothing to report.
 */
export const reduceConfirm = <A>(
  ask: ConfirmAsk<A>,
  state: ConfirmState,
  key: AskKey,
): ConfirmAction<A> => {
  if (isQuitKey(key) || key.name === "escape") return { _tag: "Cancel" };
  if (isSubmitKey(key)) {
    const choice = at(ask, state.index);
    return choice === undefined ? { _tag: "Cancel" } : { _tag: "Submit", submission: choice };
  }
  if (key.name === "left" || key.name === "up") return moved(ask, state.index, -1);
  if (key.name === "right" || key.name === "down" || key.name === "tab") {
    return moved(ask, state.index, 1);
  }
  const choice = matching(ask, key.char ?? key.name);
  return choice === undefined ? { _tag: "Next", state } : { _tag: "Submit", submission: choice };
};

const chipOf = <A>(choice: ConfirmChoice<A>, current: boolean): PromptChip => ({
  key: current ? choice.key.toUpperCase() : choice.key.toLowerCase(),
  word: choice.word,
  ...(current ? { current: true } : {}),
});

/** The question as the live scene shows it while it stands open. */
export const confirmDoc = <A>(ask: ConfirmAsk<A>, state: ConfirmState): Doc => [
  promptNode(ask, {
    chips: ask.choices.map((choice, index) => chipOf(choice, index === state.index)),
  }),
];

/** The one transcript line an answered question leaves behind. */
export const confirmAnswer = <A>(ask: ConfirmAsk<A>, choice: ConfirmChoice<A>): Doc =>
  answerDoc(ask, choice.word);

/** A `Confirm` as the `Screen` runs it. */
export const confirmKind = <A>(ask: ConfirmAsk<A>): AskKind<ConfirmState, A> => ({
  initial: initialConfirmState,
  reduce: (state, key) => {
    const action = reduceConfirm(ask, state, key);
    return action._tag === "Submit"
      ? {
          _tag: "Submit",
          value: action.submission.value,
          answer:
            action.submission.transcript === false ? [] : confirmAnswer(ask, action.submission),
        }
      : action;
  },
  view: (state) => confirmDoc(ask, state),
});
