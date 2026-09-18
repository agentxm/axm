/**
 * The question model the `Screen` runs.
 *
 * A view describes a question as data; the `Screen` adds it to the live scene,
 * reads keys, repaints, and appends the answer when it settles. Nothing here
 * paints or reads input, so a reducer and a view are ordinary pure functions
 * that a table test can drive.
 *
 * `Confirm` answers with one lettered key, `Choose` with one option from a list
 * that opens under the question, `Pick` with several from a list that filters
 * as a person types, and `Input` with one typed line.
 */

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import type * as Result from "effect/Result";

import { makeAppError, type AppError } from "../../app-error/index.js";
import type { Doc, Text } from "../doc.js";
import type { SceneFacts } from "../scene.js";

/** One lettered choice: the key that picks it, the word that says what it means. */
export interface ConfirmChoice<A> {
  readonly key: string;
  readonly word: string;
  readonly value: A;
  /** Whether selecting this choice leaves an answer in the transcript. */
  readonly transcript?: boolean;
}

export interface ConfirmAsk<A> {
  readonly _tag: "Confirm";
  readonly question: Text;
  /** What the question means, in one dim line beneath it. */
  readonly note?: Text;
  /** The label the settled answer line carries; the question by default. */
  readonly label?: string;
  /** The choices, the first of which is the default `enter` takes. */
  readonly choices: ReadonlyArray<ConfirmChoice<A>>;
}

/** One option of a `Choose`: what it is called, and the facts that tell it apart. */
export interface ChooseOption<A> {
  readonly title: string;
  /** Facts shown beside the title, which the painter joins with its separator. */
  readonly details?: ReadonlyArray<Text>;
  readonly value: A;
  /** The option the question opens on; the first option when none is. */
  readonly selected?: true;
}

export interface ChooseAsk<A> {
  readonly _tag: "Choose";
  readonly question: Text;
  /** What the question means, in one dim line beneath it. */
  readonly note?: Text;
  /** The label the settled answer line carries; the question by default. */
  readonly label?: string;
  readonly options: ReadonlyArray<ChooseOption<A>>;
}

/**
 * One option of a `Pick` as the list shows it: what it is called, the facts
 * that tell it apart, and the group it is listed under.
 */
export interface PickEntry {
  readonly title: string;
  /** Facts shown beside the title, which the painter joins with its separator. */
  readonly details?: ReadonlyArray<Text>;
  /**
   * The group the option is listed under. Options that name a group sit one
   * step in beneath its header, and groups keep the order they first appear in.
   */
  readonly group?: string;
  /** Whether the option is picked when the question opens. */
  readonly selected?: true;
}

/** One option of a `Pick` and the value picking it contributes to the answer. */
export interface PickOption<V> extends PickEntry {
  readonly value: V;
}

/** What one picked option is called, and what several are. */
export interface PickNoun {
  readonly one: string;
  readonly other: string;
}

export interface PickAsk<A> {
  readonly _tag: "Pick";
  readonly question: Text;
  /** What the question means, in one dim line beneath it. */
  readonly note?: Text;
  /** The label the settled answer line carries; the question by default. */
  readonly label?: string;
  readonly options: ReadonlyArray<PickEntry>;
  /** What the options are, for the count and for a bound that is not met. */
  readonly noun: PickNoun;
  /** The fewest options `enter` accepts; none by default. */
  readonly min?: number;
  /** The most options that may be picked; any number by default. */
  readonly max?: number;
  /** The answer the picked options make, given their positions in `options`. */
  readonly answer: (picked: ReadonlyArray<number>) => A;
}

/**
 * A `Pick` whose answer is the values of the options picked, in the order the
 * options are listed.
 */
export const pickAsk = <V>(
  spec: Omit<PickAsk<ReadonlyArray<V>>, "_tag" | "options" | "answer"> & {
    readonly options: ReadonlyArray<PickOption<V>>;
  },
): PickAsk<ReadonlyArray<V>> => ({
  ...spec,
  _tag: "Pick",
  answer: (picked) =>
    picked.flatMap((index) => {
      const option = spec.options[index];
      return option === undefined ? [] : [option.value];
    }),
});

export interface InputAsk<A> {
  readonly _tag: "Input";
  readonly question: Text;
  /** What the question means, in one dim line beneath it. */
  readonly note?: Text;
  /** The label the settled answer line carries; the question by default. */
  readonly label?: string;
  /** An example answer, shown dim until something is typed. */
  readonly placeholder?: string;
  /**
   * What the typed line answers, or in one line what is wrong with it. It is
   * pure, so a line that fails stays open with the reason beneath it.
   */
  readonly validate: (raw: string) => Result.Result<A, string>;
}

/** A question a view describes as data and the `Screen` runs. */
export type Ask<A> = ConfirmAsk<A> | ChooseAsk<A> | PickAsk<A> | InputAsk<A>;

/**
 * One key press, as a reducer sees it: the key's own name, and the character
 * it produced when it produced one.
 */
export interface AskKey {
  /** The name the terminal reports: `return`, `escape`, `left`, `y`. */
  readonly name: string;
  /** The character typed, when the key produced one. */
  readonly char?: string;
  readonly ctrl: boolean;
}

/** Whether the key ends input the way `ctrl`+`c` and `ctrl`+`d` do. */
export const isQuitKey = (key: AskKey): boolean =>
  key.ctrl && (key.name === "c" || key.name === "d");

/** Whether the key submits what the question stands on. */
export const isSubmitKey = (key: AskKey): boolean => key.name === "return" || key.name === "enter";

/** Whether text carries a control character, which is a key rather than text. */
const hasControl = (text: string): boolean =>
  [...text].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f;
  });

/** The text a key typed, or `undefined` for a key that typed none. */
export const typedText = (key: AskKey): string | undefined =>
  key.char === undefined || key.char.length === 0 || key.ctrl || hasControl(key.char)
    ? undefined
    : key.char;

/**
 * What one key did to a running question, whatever its kind: the state to
 * show next, the value it settled on with the one transcript line it leaves,
 * or a cancellation.
 */
export type AskAction<S, A> =
  | { readonly _tag: "Next"; readonly state: S }
  | { readonly _tag: "Submit"; readonly value: A; readonly answer: Doc }
  | { readonly _tag: "Cancel" };

/**
 * One kind of question as the `Screen` runs it: where it starts, what a key
 * does to it, and what the live region shows in the space it is given. Each
 * kind keeps its own state type behind this, so one loop runs them all.
 */
export interface AskKind<S, A> {
  readonly initial: S;
  readonly reduce: (state: S, key: AskKey) => AskAction<S, A>;
  readonly view: (state: S, facts: SceneFacts) => Doc;
}

/** Why a prompt would open, and how to get past it where one may not. */
export interface InteractiveGuard {
  readonly message: string;
  readonly guidance?: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
}

const DEFAULT_GUIDANCE = "Pass the value via a flag or remove --non-interactive.";

/**
 * The failure a guarded prompt raises where it may not open: a usage error
 * naming what was needed and how to supply it without answering a question.
 */
export const promptRequired = (guard: InteractiveGuard): AppError =>
  makeAppError({
    code: "usage",
    detail: `Interactive prompt required: ${guard.message}`,
    suggestions: guard.suggestions ?? [{ description: guard.guidance ?? DEFAULT_GUIDANCE }],
  });
