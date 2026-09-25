import type { Doc } from "../../screen/doc.js";
import { waitSettled } from "../../screen/wait/view.js";
import type { WaitView } from "../../screen/wait/wait.js";

const publicationAuthorization: WaitView = {
  subject: "publication-authorization",
  detail: "waiting on you",
  label: "Publication authorization",
  status: "Waiting for approval",
  brief: [],
  expiresAtMs: 600_000,
};

/**
 * What a wait leaves behind once the person has acted: one record line whose
 * elapsed time sits at the value column, beside the answers of the same run.
 */
export const waitSettledFixture: Doc = [
  { _tag: "answer", mark: "ok", label: "Device sign-in", value: "48.2s" },
  ...waitSettled(publicationAuthorization, 12_400),
];
