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
import type * as Terminal from "effect/Terminal";

import type { Doc } from "../doc.js";
import type { ScenePart } from "../scene.js";
import type { Ask, AskKey } from "./ask.js";
import {
  confirmAnswer,
  confirmDoc,
  initialConfirmState,
  reduceConfirm,
  type ConfirmState,
} from "./confirm.js";
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

export const runAsk = <A>(
  ask: Ask<A>,
  terminal: Terminal.Terminal,
  surface: AskSurface,
): Effect.Effect<A, PromptCancelled> =>
  Effect.gen(function* () {
    const keys = yield* terminal.readInput;
    // The queue's one failure is its end, where the terminal stopped sending
    // keys — end of input, or the interrupt it quits on — and an unanswered
    // question is a cancellation.
    const nextKey = Queue.take(keys).pipe(
      Effect.map(askKeyOf),
      Effect.catch(() => cancelled),
    );
    const show = (state: ConfirmState) => surface.showInteraction(() => confirmDoc(ask, state));
    const loop = (state: ConfirmState): Effect.Effect<A, PromptCancelled> =>
      Effect.flatMap(nextKey, (key) => {
        const action = reduceConfirm(ask, state, key);
        if (action._tag === "Cancel") return cancelled;
        if (action._tag === "Submit") {
          // The question leaves the region before its answer joins the
          // transcript, so the two never stand on screen together.
          return surface
            .showInteraction(undefined)
            .pipe(
              Effect.andThen(surface.transcript(confirmAnswer(ask, action.choice))),
              Effect.as(action.choice.value),
            );
        }
        return Effect.flatMap(show(action.state), () => loop(action.state));
      });
    yield* show(initialConfirmState);
    return yield* loop(initialConfirmState);
  }).pipe(
    // However it ends — answered, cancelled, or interrupted — nothing of the
    // question is left standing in the live region.
    Effect.ensuring(surface.showInteraction(undefined)),
    Effect.scoped,
  );
