/**
 * The wait model the `Screen` runs.
 *
 * A wait parks the terminal while a person acts somewhere else: approving a
 * sign-in, entering a one-time code, completing verification. A view describes
 * it as data and the `Screen` puts it beneath the operation's ledger, keeps
 * only its countdown live, and races the awaited result against the keys that
 * reopen, copy, and stop it. Nothing here paints or reads input, so the
 * reducer and the view are ordinary pure functions.
 */

import type * as Effect from "effect/Effect";

import type { Doc } from "../doc.js";
import { isQuitKey, type InteractionKey } from "../interaction.js";

/** One handoff to a person, as the terminal shows it while it stands open. */
export interface WaitView {
  /**
   * The lifecycle unit this wait parks. A wait whose subject is a unit id
   * marks that ledger row paused for as long as it stands open.
   */
  readonly subject: string;
  /** Why the operation is parked, as the paused row and machine output read it. */
  readonly detail: string;
  /** The label the settled line carries. */
  readonly label: string;
  /** What the live line says while the wait stands open. */
  readonly status: string;
  /**
   * Printed to the transcript once when the wait opens: what to do, and the
   * link and code a person copies. Copyable values live here and never on the
   * live line, which repaints and is truncated to the terminal width.
   */
  readonly brief: Doc;
  /** Epoch milliseconds the handoff expires at; the live line counts down to it. */
  readonly expiresAtMs?: number;
}

/** What a wait's keys do. A key with nothing to do is not offered. */
export interface WaitActions {
  /** Reopen the browser at the handoff's location. */
  readonly open?: Effect.Effect<unknown>;
  /** Copy the value the person needs, usually the link. */
  readonly copy?: Effect.Effect<unknown>;
}

/** Which keys one wait offers, which decides both its chips and its reducer. */
export interface WaitKeys {
  readonly open: boolean;
  readonly copy: boolean;
}

export const waitKeys = (actions: WaitActions): WaitKeys => ({
  open: actions.open !== undefined,
  copy: actions.copy !== undefined,
});

export type WaitKeyAction = "open" | "copy" | "stop" | "ignore";

/**
 * One key against an open wait. Escape and an interrupt stop it; `o` and `c`
 * act where the wait offers them. Every other key leaves the wait exactly as
 * it stood, because a wait has nothing to answer.
 */
export const reduceWaitKey = (key: InteractionKey, keys: WaitKeys): WaitKeyAction => {
  if (isQuitKey(key) || key.name === "escape") return "stop";
  const typed = (key.char ?? key.name).toLowerCase();
  if (keys.open && typed === "o") return "open";
  if (keys.copy && typed === "c") return "copy";
  return "ignore";
};
