/**
 * The question model the `Screen` runs.
 *
 * A view describes a question as data; the `Screen` adds it to the live scene,
 * reads keys, repaints, and appends the answer when it settles. Nothing here
 * paints or reads input, so a reducer and a view are ordinary pure functions
 * that a table test can drive.
 *
 * Only `Confirm` exists so far; the remaining kinds join this union with their
 * own reducers and views.
 */

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";

import { makeAppError, type AppError } from "../../app-error/index.js";
import type { Text } from "../doc.js";

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

/** A question a view describes as data and the `Screen` runs. */
export type Ask<A> = ConfirmAsk<A>;

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
