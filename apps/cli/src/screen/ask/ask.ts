/**
 * The question model the `Screen` runs.
 *
 * A view describes a question as data; the `Screen` adds it to the live scene,
 * reads keys, repaints, and appends the answer when it settles. Nothing here
 * paints or reads input, so a reducer and a view are ordinary pure functions
 * that a table test can drive.
 *
 * `Confirm` answers with one lettered key, `Choose` with one option from a list
 * that opens under the question, and `Input` with one typed line.
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
export type Ask<A> = ConfirmAsk<A> | ChooseAsk<A> | InputAsk<A>;

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
