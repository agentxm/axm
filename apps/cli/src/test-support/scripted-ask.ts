/**
 * Scripted questions for test screens.
 *
 * Each answer names its question kind, then replays the keys a person would
 * press through the production reducer. Every state is also handed to the
 * production view. A wrong kind, unknown title, duplicate title, or answer
 * outside a Pick's bounds is a broken test script rather than a cancellation.
 */

import * as Effect from "effect/Effect";

import {
  promptRequired,
  type Ask,
  type AskKey,
  type AskKind,
  type InteractiveGuard,
} from "../screen/ask/ask.js";
import { pickRows } from "../screen/ask/pick.js";
import { QuestionCancelled } from "../screen/ask/question-cancelled.js";
import { withAskKind } from "../screen/ask/run.js";
import { plain, type Doc } from "../screen/doc.js";

export type ScriptedAnswer =
  | { readonly _tag: "Confirm"; readonly key: string }
  | { readonly _tag: "Choose"; readonly title: string }
  | { readonly _tag: "Pick"; readonly titles: ReadonlyArray<string> }
  | { readonly _tag: "Input"; readonly text: string }
  | { readonly _tag: "Cancel" };

/** Questions, guards, and live views observed by a test screen. */
export interface AskScript {
  readonly asks: Array<Ask<unknown>>;
  readonly guards: Array<InteractiveGuard>;
  readonly views: Array<Doc>;
  readonly answers: Array<ScriptedAnswer>;
}

export const emptyAskScript = (): AskScript => ({
  asks: [],
  guards: [],
  views: [],
  answers: [],
});

const enter: AskKey = { name: "return", ctrl: false };

const pressed = (char: string): AskKey => ({ name: char, char, ctrl: false });

const invalidScript = (message: string): never => {
  throw new Error(`Invalid prompt script: ${message}`);
};

/** The keys a person presses to give `scripted` to `ask`, ending on enter. */
const keysFor = <A>(ask: Ask<A>, scripted: ScriptedAnswer | undefined): ReadonlyArray<AskKey> => {
  if (scripted === undefined) return [enter];
  if (scripted._tag === "Cancel") return [{ name: "escape", ctrl: false }];
  if (scripted._tag !== ask._tag) {
    return invalidScript(`expected ${ask._tag}, received ${scripted._tag}`);
  }
  switch (ask._tag) {
    case "Confirm": {
      if (scripted._tag !== "Confirm") return invalidScript("Confirm answer kind changed");
      return [pressed(scripted.key)];
    }
    case "Choose": {
      if (scripted._tag !== "Choose") return invalidScript("Choose answer kind changed");
      const index = ask.options.findIndex((option) => option.title === scripted.title);
      if (index < 0) return invalidScript(`Choose has no option titled ${scripted.title}`);
      return [
        ...ask.options.map((): AskKey => ({ name: "up", ctrl: false })),
        ...Array.from({ length: index }, (): AskKey => ({ name: "down", ctrl: false })),
        enter,
      ];
    }
    case "Pick": {
      if (scripted._tag !== "Pick") return invalidScript("Pick answer kind changed");
      const wanted = new Set(scripted.titles);
      if (wanted.size !== scripted.titles.length) {
        return invalidScript("Pick titles must be unique");
      }
      const available = new Set(ask.options.map((option) => option.title));
      const missing = scripted.titles.filter((title) => !available.has(title));
      if (missing.length > 0)
        return invalidScript(`Pick has no option titled ${missing.join(", ")}`);
      if (ask.min !== undefined && wanted.size < ask.min) {
        return invalidScript(`Pick requires at least ${String(ask.min)} selections`);
      }
      if (ask.max !== undefined && wanted.size > ask.max) {
        return invalidScript(`Pick accepts at most ${String(ask.max)} selections`);
      }
      const rows = pickRows(ask, "");
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
      if (scripted._tag !== "Input") return invalidScript("Input answer kind changed");
      return [...[...scripted.text].map(pressed), enter];
  }
};

/** Replay keys through one production kind and retain every live document. */
const replay = <S, A>(kind: AskKind<S, A>, keys: ReadonlyArray<AskKey>, views: Array<Doc>) => {
  let state = kind.initial;
  views.push(kind.view(state, { columns: 80, rows: 24, spinner: "⠋", nowMs: 0 }));
  for (const key of keys) {
    const action = kind.reduce(state, key);
    if (action._tag !== "Next") return action;
    state = action.state;
    views.push(kind.view(state, { columns: 80, rows: 24, spinner: "⠋", nowMs: 0 }));
  }
  return { _tag: "Cancel" } as const;
};

const answered = <A>(
  ask: Ask<A>,
  keys: ReadonlyArray<AskKey>,
  views: Array<Doc>,
): { readonly value: A; readonly answer: Doc } | undefined => {
  const action = withAskKind(ask, (kind) => replay(kind, keys, views));
  return action._tag === "Submit" ? { value: action.value, answer: action.answer } : undefined;
};

export const scriptedAsk =
  (script: AskScript, record: (doc: Doc) => void, available = true) =>
  <A>(
    ask: Ask<A>,
    guard: InteractiveGuard = {},
  ): Effect.Effect<A, QuestionCancelled | ReturnType<typeof promptRequired>> => {
    script.asks.push(ask);
    script.guards.push(guard);
    if (!available) return Effect.fail(promptRequired(plain(ask.question), guard));
    const result = answered(ask, keysFor(ask, script.answers.shift()), script.views);
    if (result === undefined) {
      return Effect.fail(new QuestionCancelled({ message: "Operation cancelled." }));
    }
    record(result.answer);
    return Effect.succeed(result.value);
  };
