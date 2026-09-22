import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import type * as Scope from "effect/Scope";
import type * as Terminal from "effect/Terminal";

import type { Doc } from "./doc.js";
import type { ScenePart } from "./scene.js";

/** The one scene/transcript surface shared by questions and waits. */
export interface InteractionSurface {
  readonly showInteraction: (part: ScenePart | undefined) => Effect.Effect<void>;
  readonly transcript: (doc: Doc) => Effect.Effect<void>;
  /** Atomically replace controls with their durable disposition. */
  readonly finish: (doc: Doc) => Effect.Effect<void>;
}

/** One terminal key after platform input has been normalized. */
export interface InteractionKey {
  readonly name: string;
  readonly char?: string;
  readonly ctrl: boolean;
}

export const interactionKeyOf = (input: Terminal.UserInput): InteractionKey => ({
  name: input.key.name,
  ...Option.match(input.input, { onNone: () => ({}), onSome: (char) => ({ char }) }),
  ctrl: input.key.ctrl,
});

export const isQuitKey = (key: InteractionKey): boolean =>
  key.ctrl && (key.name === "c" || key.name === "d");

export const isSubmitKey = (key: InteractionKey): boolean =>
  key.name === "return" || key.name === "enter";

/**
 * Acquire one terminal input queue and return its reusable normalized-key
 * reader. The queue belongs to the surrounding scope; every key for this
 * interaction must come through the same acquisition so raw-mode listeners
 * are installed and released exactly once.
 */
export const makeInteractionKeyReader = <E, R>(
  terminal: Terminal.Terminal,
  onEnd: Effect.Effect<never, E, R>,
): Effect.Effect<Effect.Effect<InteractionKey, E, R>, never, Scope.Scope> =>
  Effect.map(terminal.readInput, (input) =>
    Queue.take(input).pipe(
      Effect.map(interactionKeyOf),
      Effect.catch(() => onEnd),
    ),
  );
