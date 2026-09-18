import type { Doc } from "../../screen/doc.js";
import { confirmAnswer } from "../../screen/ask/confirm.js";
import { setupResultDoc } from "../../root/setup/view.js";
import { applyAsk, initializedOutcome, setupNext, sourceAnswered } from "./setup-records.js";

/**
 * The settled setup: the answers, the gate's answer, the ledger of every file
 * the workspace now occupies, the verdict with its counts, the one limit the
 * agents have in this scope, and what to run next (board `Ledger-setup-play`,
 * frame *done*). The plan ledger the gate asked about stays above it in
 * scrollback; nothing in between is a blank-line remnant of a prompt.
 */
export const ledgerSetupPlayDone: Doc = [
  ...sourceAnswered,
  ...confirmAnswer(applyAsk, { key: "y", word: "yes", value: true }),
  ...setupResultDoc(initializedOutcome, {
    verbosity: "normal",
    suggestions: setupNext,
    displayDirectory: (directory) => directory,
  }),
];
