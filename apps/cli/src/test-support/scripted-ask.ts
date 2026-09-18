/**
 * A scripted answer for a test screen.
 *
 * A double that simply returned a value would not prove that the question it
 * was given can be answered at all, so this replays the keys a person would
 * press through the question's real reducer. A script entry means what a person
 * would do with that kind of question: a choice key such as `"y"` for a
 * confirmation, an option's title for a list, the titles to leave picked —
 * joined by `", "`, or `""` for none — for a list that takes several, and the
 * line to type for an input. An unscripted question takes `enter` where it opens. An entry of
 * `"cancel"`, or one the question cannot take, cancels.
 */

import * as Effect from "effect/Effect";

import type { Ask, AskKey, AskKind } from "../screen/ask/ask.js";
import { chooseKind } from "../screen/ask/choose.js";
import { confirmKind } from "../screen/ask/confirm.js";
import { inputKind } from "../screen/ask/input.js";
import { pickKind, pickRows } from "../screen/ask/pick.js";
import { PromptCancelled } from "../screen/ask/prompt-cancelled.js";
import type { Doc } from "../screen/doc.js";

/** Questions a test screen was given, and what it answers the next ones with. */
export interface AskScript {
  readonly asks: Array<Ask<unknown>>;
  /** Answers in the order questions arise, or `"cancel"`. */
  readonly answers: Array<string>;
}

export const emptyAskScript = (): AskScript => ({ asks: [], answers: [] });

const enter: AskKey = { name: "return", ctrl: false };

const pressed = (char: string): AskKey => ({ name: char, char, ctrl: false });

/** The keys a person presses to give `scripted` to `ask`, ending on `enter`. */
const keysFor = <A>(ask: Ask<A>, scripted: string | undefined): ReadonlyArray<AskKey> => {
  if (scripted === undefined) return [enter];
  switch (ask._tag) {
    case "Confirm":
      return [pressed(scripted)];
    case "Choose": {
      const index = ask.options.findIndex((option) => option.title === scripted);
      // Walk the caret up to the top, then down to the scripted option.
      return index < 0
        ? [{ name: "escape", ctrl: false }]
        : [
            ...ask.options.map((): AskKey => ({ name: "up", ctrl: false })),
            ...Array.from({ length: index }, (): AskKey => ({ name: "down", ctrl: false })),
            enter,
          ];
    }
    case "Pick": {
      const wanted = new Set(scripted.length === 0 ? [] : scripted.split(", "));
      const rows = pickRows(ask, "");
      // Walk every row from the top, toggling each option whose mark is not
      // what the script leaves it as.
      return [
        ...rows.map((): AskKey => ({ name: "up", ctrl: false })),
        ...rows.flatMap((row): ReadonlyArray<AskKey> => {
          const option = row._tag === "Option" ? ask.options[row.index] : undefined;
          const toggle =
            option !== undefined && (option.selected === true) !== wanted.has(option.title);
          return [...(toggle ? [pressed(" ")] : []), { name: "down", ctrl: false }];
        }),
        enter,
      ];
    }
    case "Input":
      return [...[...scripted].map(pressed), enter];
  }
};

/** Replay `keys` through `kind` and answer with where they left it. */
const replay = <S, A>(kind: AskKind<S, A>, keys: ReadonlyArray<AskKey>) => {
  let state = kind.initial;
  for (const key of keys) {
    const action = kind.reduce(state, key);
    if (action._tag !== "Next") return action;
    state = action.state;
  }
  // The keys ran out with the question still open: nothing answered it.
  return { _tag: "Cancel" } as const;
};

const answered = <A>(
  ask: Ask<A>,
  keys: ReadonlyArray<AskKey>,
): { readonly value: A; readonly answer: Doc } | undefined => {
  const action =
    ask._tag === "Confirm"
      ? replay(confirmKind(ask), keys)
      : ask._tag === "Choose"
        ? replay(chooseKind(ask), keys)
        : ask._tag === "Pick"
          ? replay(pickKind(ask), keys)
          : replay(inputKind(ask), keys);
  return action._tag === "Submit" ? { value: action.value, answer: action.answer } : undefined;
};

export const scriptedAsk =
  (script: AskScript, record: (doc: Doc) => void) =>
  <A>(ask: Ask<A>): Effect.Effect<A, PromptCancelled> => {
    script.asks.push(ask);
    const scripted = script.answers.shift();
    const result = scripted === "cancel" ? undefined : answered(ask, keysFor(ask, scripted));
    if (result === undefined) {
      return Effect.fail(new PromptCancelled({ message: "Operation cancelled." }));
    }
    record(result.answer);
    return Effect.succeed(result.value);
  };
