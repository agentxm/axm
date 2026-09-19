import {
  admittedSet,
  codeReview,
  publishFrame,
  reviewKit,
  reviewer,
  triage,
} from "./samples/publish-results.js";

/**
 * The plan (*Reference cases*, board `1 · Publish, contract-true`, frame
 * *Risk-free publish has no gate — the plan ledger*), as `--preview` prints
 * it.
 *
 * Publish has no confirmable condition and no browser approval, so an apply
 * goes from this ledger straight to the upload and the canvas's approval wait
 * drops out. One row per extension says what the run will do with it — the
 * pack after the two members it contains, the existing version skipped — and
 * the facts every row shares, visibility and source, are stated once beneath.
 */
export const refPublishPlan = publishFrame({
  mode: "preview",
  publicationSet: admittedSet([codeReview, reviewer, reviewKit, triage]),
  results: [codeReview, reviewer, reviewKit, triage],
});
