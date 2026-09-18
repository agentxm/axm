/**
 * The `Choose` kind: one option from a list that opens under the question.
 *
 * A list opens only when the options need reading, so each carries the facts
 * that tell it apart. The caret stands in the gutter beside the option `enter`
 * takes. The list shows as many options as the height it is given allows and
 * names how many it left out, so it never scrolls the terminal; the window
 * follows the caret. Neither the reducer nor the view touches the terminal.
 */

import type { Doc } from "../doc.js";
import {
  isQuitKey,
  isSubmitKey,
  type AskKey,
  type AskKind,
  type ChooseAsk,
  type ChooseOption,
} from "./ask.js";

/** Which option the caret stands on. */
export interface ChooseState {
  readonly index: number;
}

export type ChooseAction<A> =
  | { readonly _tag: "Next"; readonly state: ChooseState }
  | { readonly _tag: "Submit"; readonly option: ChooseOption<A> }
  | { readonly _tag: "Cancel" };

/** The question opens on its selected option, else on its first. */
export const initialChooseState = <A>(ask: ChooseAsk<A>): ChooseState => ({
  index: Math.max(
    0,
    ask.options.findIndex((option) => option.selected === true),
  ),
});

const moved = <A>(ask: ChooseAsk<A>, index: number, step: number): ChooseAction<A> => ({
  _tag: "Next",
  state: { index: Math.min(Math.max(0, index + step), Math.max(0, ask.options.length - 1)) },
});

/**
 * One key against one list. The arrows move the caret and stop at either end,
 * so holding a key never wraps a person back to where they started; `enter`
 * takes the option under the caret; escape and an interrupt cancel. Any other
 * key leaves the list as it stood.
 */
export const reduceChoose = <A>(
  ask: ChooseAsk<A>,
  state: ChooseState,
  key: AskKey,
): ChooseAction<A> => {
  if (isQuitKey(key) || key.name === "escape") return { _tag: "Cancel" };
  if (isSubmitKey(key)) {
    const option = ask.options[state.index];
    return option === undefined ? { _tag: "Cancel" } : { _tag: "Submit", option };
  }
  if (key.name === "up") return moved(ask, state.index, -1);
  if (key.name === "down") return moved(ask, state.index, 1);
  return { _tag: "Next", state };
};

/**
 * The options that fit `rows` lines once the question and its note have
 * theirs. A list that fits shows whole; one that does not gives a line to
 * naming what it left out, and keeps the caret in view by starting no later
 * than it must.
 */
export const chooseWindow = <A>(
  ask: ChooseAsk<A>,
  state: ChooseState,
  rows: number,
): { readonly start: number; readonly size: number } => {
  const count = ask.options.length;
  const room = rows - 1 - (ask.note === undefined ? 0 : 1);
  if (count <= room) return { start: 0, size: count };
  const size = Math.max(1, room - 1);
  return { start: Math.min(Math.max(0, state.index - size + 1), count - size), size };
};

/** The question as the live scene shows it in `rows` lines while it stands open. */
export const chooseDoc = <A>(ask: ChooseAsk<A>, state: ChooseState, rows: number): Doc => {
  const { start, size } = chooseWindow(ask, state, rows);
  return [
    {
      _tag: "prompt",
      question: ask.question,
      ...(ask.note === undefined ? {} : { note: ask.note }),
      chips: [],
      options: ask.options.slice(start, start + size).map((option, offset) => ({
        title: option.title,
        ...(option.details === undefined ? {} : { details: option.details }),
        ...(start + offset === state.index ? { current: true } : {}),
      })),
      more: ask.options.length - size,
    },
  ];
};

/** The one transcript line an answered list leaves behind: the option's title. */
export const chooseAnswer = <A>(ask: ChooseAsk<A>, option: ChooseOption<A>): Doc => [
  { _tag: "answer", mark: "ok", label: ask.label ?? ask.question, value: option.title },
];

/** A `Choose` as the `Screen` runs it. */
export const chooseKind = <A>(ask: ChooseAsk<A>): AskKind<ChooseState, A> => ({
  initial: initialChooseState(ask),
  reduce: (state, key) => {
    const action = reduceChoose(ask, state, key);
    return action._tag === "Submit"
      ? { _tag: "Submit", value: action.option.value, answer: chooseAnswer(ask, action.option) }
      : action;
  },
  view: (state, facts) => chooseDoc(ask, state, facts.rows),
});
