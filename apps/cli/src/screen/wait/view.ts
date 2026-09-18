/**
 * What an open wait looks like, and what it leaves behind.
 *
 * The live line carries only what is safe to repaint: the running mark, what
 * the terminal is parked on, the countdown at the value column, and the keys
 * beneath it. The link and the code went to the transcript once when the wait
 * opened, so nothing a person copies is ever truncated. When the wait settles
 * it leaves one line: the same record shape an answered question leaves.
 */

import type { Doc, PromptChip } from "../doc.js";
import { duration, remainingTime, waitKeyWord } from "../phrases.js";
import type { WaitKeys, WaitView } from "./wait.js";

/** The keys an open wait offers, in paint order; stopping is always offered. */
export const waitChips = (keys: WaitKeys): ReadonlyArray<PromptChip> => [
  ...(keys.open ? [{ key: "o", word: waitKeyWord("open") }] : []),
  ...(keys.copy ? [{ key: "c", word: waitKeyWord("copy") }] : []),
  { key: "esc", word: waitKeyWord("stop") },
];

/** The wait as the live scene shows it while it stands open. */
export const waitDoc = (view: WaitView, keys: WaitKeys, facts: { readonly nowMs: number }): Doc => [
  {
    _tag: "wait",
    status: view.status,
    ...(view.expiresAtMs === undefined
      ? {}
      : { remaining: remainingTime(view.expiresAtMs - facts.nowMs) }),
    chips: waitChips(keys),
  },
];

/** The one transcript line a settled wait leaves behind. */
export const waitSettled = (view: WaitView, elapsedMs: number): Doc => [
  { _tag: "answer", mark: "ok", label: view.label, value: duration(elapsedMs) },
];
