/**
 * Running a wait against a real terminal.
 *
 * The view is pure; this is the only part that reads keys and moves the scene.
 * It prints the wait's brief to the transcript once, puts the countdown line
 * beneath the operation's ledger, and races the awaited effect against the
 * keys: `o` reopens, `c` copies, `esc` and an interrupt stop the wait. Raw
 * mode belongs to `Terminal.readInput`, which restores it when this scope
 * closes.
 */

import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import type * as Terminal from "effect/Terminal";

import { publishWaitEnded, publishWaiting } from "@agentxm/workspace/transitions/planning";

import type { Doc } from "../doc.js";
import type { ScenePart } from "../scene.js";
import { askKeyOf } from "../ask/run.js";
import { WaitAbandoned } from "./wait-abandoned.js";
import { waitDoc, waitSettled } from "./view.js";
import { reduceWaitKey, waitKeys, type WaitActions, type WaitView } from "./wait.js";

/** Where a running wait paints, and where its brief and its settlement land. */
export interface WaitSurface {
  /** Replace the interaction beneath the ledger; `undefined` clears it. */
  readonly showInteraction: (part: ScenePart | undefined) => Effect.Effect<void>;
  /** Append a settled document to the transcript. */
  readonly transcript: (doc: Doc) => Effect.Effect<void>;
}

const STOPPED = "Stopped waiting.";

const failedActionDoc = (action: "open" | "copy"): Doc => [
  {
    _tag: "headline",
    tone: "warn",
    text:
      action === "open"
        ? "Could not open the browser. Use the URL above."
        : "Could not copy to the clipboard. Copy the value above.",
  },
];

/**
 * Carry one wait as a lifecycle fact for as long as it stands open. The
 * `Waiting` event names the unit the wait parks, so the live ledger paints
 * that row paused and every lossless observer sees the same pause. Every
 * screen pairs its waits this way, whatever it can show of them.
 */
export const parkedOnWait = <A, E, R>(
  view: WaitView,
  run: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  publishWaiting({
    blockingClass: "human-required",
    subject: view.subject,
    detail: view.detail,
  }).pipe(Effect.andThen(run), Effect.ensuring(publishWaitEnded(view.subject)));

/**
 * The static form: the brief alone, with no countdown and no keys. It is what
 * a terminal that cannot animate — and a quiet invocation — shows, and the
 * command simply waits.
 */
export const runStaticWait = <A, E, R>(
  view: WaitView,
  awaited: Effect.Effect<A, E, R>,
  surface: WaitSurface,
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    yield* surface.transcript(view.brief);
    const startedAtMs = yield* Clock.currentTimeMillis;
    const value = yield* awaited;
    const elapsed = (yield* Clock.currentTimeMillis) - startedAtMs;
    yield* surface.transcript(waitSettled(view, elapsed));
    return value;
  });

export const runWait = <A, E, R>(
  view: WaitView,
  awaited: Effect.Effect<A, E, R>,
  actions: WaitActions,
  terminal: Terminal.Terminal,
  surface: WaitSurface,
): Effect.Effect<A, E | WaitAbandoned, R> =>
  Effect.gen(function* () {
    const keys = waitKeys(actions);
    const input = yield* terminal.readInput;
    // A terminal that stopped sending keys cannot stop the wait either, so the
    // wait goes on waiting for the one thing that can still end it.
    const nextKey = Queue.take(input).pipe(
      Effect.map(askKeyOf),
      Effect.catch(() => Effect.never),
    );
    const runAction = (action: "open" | "copy", effect: Effect.Effect<unknown>) =>
      Effect.flatMap(effect, (result) =>
        Effect.andThen(
          result === false ? surface.transcript(failedActionDoc(action)) : Effect.void,
          readKeys(),
        ),
      );
    const readKeys = (): Effect.Effect<never, WaitAbandoned> =>
      Effect.flatMap(nextKey, (key) => {
        switch (reduceWaitKey(key, keys)) {
          case "stop":
            return Effect.fail(new WaitAbandoned({ message: STOPPED }));
          case "open":
            return runAction("open", actions.open ?? Effect.void);
          case "copy":
            return runAction("copy", actions.copy ?? Effect.void);
          case "ignore":
            return readKeys();
        }
      });

    yield* surface.transcript(view.brief);
    // Only the countdown repaints; the part reads the frame's own clock, so
    // one showing stands for every frame the region paints after it.
    yield* surface.showInteraction((facts) => waitDoc(view, keys, facts));
    const startedAtMs = yield* Clock.currentTimeMillis;
    const value = yield* Effect.raceFirst(awaited, readKeys());
    const elapsed = (yield* Clock.currentTimeMillis) - startedAtMs;
    // The wait leaves the region before its settled line joins the transcript,
    // so the two never stand on screen together.
    yield* surface.showInteraction(undefined);
    yield* surface.transcript(waitSettled(view, elapsed));
    return value;
  }).pipe(
    // However it ends — settled, stopped, or interrupted — nothing of the wait
    // is left standing in the live region.
    Effect.ensuring(surface.showInteraction(undefined)),
    Effect.scoped,
  );
