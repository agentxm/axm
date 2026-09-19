import type { PublishResultItem } from "@agentxm/workspace/publishing";

import {
  admittedSet,
  codeReview,
  publishFrame,
  reviewKit,
  reviewer,
  triage,
} from "./samples/publish-results.js";

const published = (item: PublishResultItem): PublishResultItem => ({
  ...item,
  phase: "upload_execution",
  status: "success",
  settlement: "response",
  links: { html: `https://agentxm.ai/${item.id}` },
});

/**
 * The settled publication (*Reference cases*, board `1 · Publish,
 * contract-true*, frame *Settled — one ledger in scrollback*).
 *
 * The rows carry what happened, so the verdict carries no mark; its aside says
 * the visibility the extensions took and how long the run took. The pack's
 * registry page is a copyable line of its own, and its members, which it
 * contains, do not repeat theirs. The canvas's approval line drops out with
 * browser approval.
 */
export const refPublishSettled = publishFrame(
  {
    mode: "apply",
    publicationSet: admittedSet([codeReview, reviewer, reviewKit, triage]),
    results: [published(codeReview), published(reviewer), published(reviewKit), triage],
  },
  { elapsedMs: 42_000 },
);
