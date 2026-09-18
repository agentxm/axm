import type { Doc } from "../../screen/doc.js";
import { waitSettled } from "../../screen/wait/view.js";
import type { WaitView } from "../../screen/wait/wait.js";

const stepUp: WaitView = {
  subject: "step-up-verification",
  detail: "waiting on you",
  label: "Verification of yank",
  status: "Waiting for verification of yank",
  brief: [],
  expiresAtMs: 600_000,
};

/**
 * What a wait leaves behind once the person has acted: one record line whose
 * elapsed time sits at the value column, beside the answers of the same run.
 */
export const waitSettledFixture: Doc = [
  { _tag: "answer", mark: "ok", label: "Device sign-in", value: "48.2s" },
  ...waitSettled(stepUp, 12_400),
];
