/**
 * Running a question against a real terminal.
 *
 * The reducer and the view are pure; this is the only part that reads keys and
 * moves the scene. It puts the question beneath the operation's ledger, reads
 * one key at a time from the terminal's own input, repaints, and on submission
 * clears the question and appends its answer to the transcript. Raw mode
 * belongs to `Terminal.readInput`, which restores it when this scope closes.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import type * as Scope from "effect/Scope";
import type * as Terminal from "effect/Terminal";

import type { Doc } from "../doc.js";
import type { ScenePart } from "../scene.js";
import type { Ask, AskKey, AskKind } from "./ask.js";
import { chooseKind } from "./choose.js";
import { confirmKind } from "./confirm.js";
import { inputKind } from "./input.js";
import { pickKind } from "./pick.js";
import { PromptCancelled } from "./prompt-cancelled.js";

/** Where a running question paints, and where its answer lands. */
export interface AskSurface {
  /** Replace the interaction beneath the ledger; `undefined` clears it. */
  readonly showInteraction: (part: ScenePart | undefined) => Effect.Effect<void>;
  /** Append a settled document to the transcript. */
  readonly transcript: (doc: Doc) => Effect.Effect<void>;
}

const CANCELLED = "Operation cancelled.";

const cancelled = Effect.fail(new PromptCancelled({ message: CANCELLED }));

/** One terminal key event as a reducer sees it. */
export const askKeyOf = (input: Terminal.UserInput): AskKey => ({
  name: input.key.name,
  ...Option.match(input.input, { onNone: () => ({}), onSome: (char) => ({ char }) }),
  ctrl: input.key.ctrl,
});

/** Hand a question's own kind to `use`, whatever state type that kind keeps. */
const withKind = <A, R>(ask: Ask<A>, use: <S>(kind: AskKind<S, A>) => R): R => {
  switch (ask._tag) {
    case "Confirm":
      return use(confirmKind(ask));
    case "Choose":
      return use(chooseKind(ask));
    case "Pick":
      return use(pickKind(ask));
    case "Input":
      return use(inputKind(ask));
  }
};

/** Read keys into one kind until it settles; raw mode lasts as long as the scope. */
const runKind = <S, A>(
  kind: AskKind<S, A>,
  terminal: Terminal.Terminal,
  surface: AskSurface,
): Effect.Effect<A, PromptCancelled, Scope.Scope> =>
  Effect.gen(function* () {
    const keys = yield* terminal.readInput;
    // The queue's one failure is its end, where the terminal stopped sending
    // keys — end of input, or the interrupt it quits on — and an unanswered
    // question is a cancellation.
    const nextKey = Queue.take(keys).pipe(
      Effect.map(askKeyOf),
      Effect.catch(() => cancelled),
    );
    // The view is handed the space the scene gives it on every paint, so a
    // list sized to the terminal follows a resize without a key being pressed.
    const show = (state: S) => surface.showInteraction((facts) => kind.view(state, facts));
    const loop = (state: S): Effect.Effect<A, PromptCancelled> =>
      Effect.flatMap(nextKey, (key) => {
        const action = kind.reduce(state, key);
        if (action._tag === "Cancel") return cancelled;
        if (action._tag === "Submit") {
          // The question leaves the region before its answer joins the
          // transcript, so the two never stand on screen together.
          return surface
            .showInteraction(undefined)
            .pipe(Effect.andThen(surface.transcript(action.answer)), Effect.as(action.value));
        }
        return Effect.flatMap(show(action.state), () => loop(action.state));
      });
    yield* show(kind.initial);
    return yield* loop(kind.initial);
  });

export const runAsk = <A>(
  ask: Ask<A>,
  terminal: Terminal.Terminal,
  surface: AskSurface,
): Effect.Effect<A, PromptCancelled> =>
  withKind(ask, (kind) => runKind(kind, terminal, surface)).pipe(
    // However it ends — answered, cancelled, or interrupted — nothing of the
    // question is left standing in the live region.
    Effect.ensuring(surface.showInteraction(undefined)),
    Effect.scoped,
  );
