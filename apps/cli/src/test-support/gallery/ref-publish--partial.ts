import type { PublishResultItem } from "@agentxm/workspace/publishing";

import { admittedSet, codeReview, publishFrame, reviewKit, reviewer } from "./publish-results.js";

/**
 * A partial publication: one extension published, one failed at upload, and
 * the pack that contains them never tried. What the registry now holds stays
 * published, so the verdict names the outcome, its aside the counts and the
 * exit code, and the recovery replays exactly the unfinished extensions.
 */
const failed: PublishResultItem = {
  ...reviewer,
  action: "error",
  phase: "upload_execution",
  status: "failed",
  reason: "upload_failed",
  message: "Registry upload is temporarily unavailable.",
  cause: {
    code: "unavailable",
    class: "external",
    message: "Registry upload is temporarily unavailable.",
    retryable: true,
    attemptCount: 3,
    maxAttempts: 3,
    requestId: "req_8f3k2",
  },
};

export const refPublishPartial = publishFrame(
  {
    mode: "apply",
    publicationSet: admittedSet([codeReview, reviewer, reviewKit]),
    results: [
      { ...codeReview, phase: "upload_execution", status: "success" },
      failed,
      {
        ...reviewKit,
        action: "error",
        phase: "dependency_execution",
        status: "blocked",
        reason: "blocked_by_dependency",
        blockedBy: [reviewer.id],
      },
    ],
  },
  {
    exitCode: 8,
    suggestions: [
      {
        description: "Continue the failed items and their blocked dependents",
        cmd: "axm publish --on-existing verify @acme/subagents/reviewer @acme/packs/review-kit",
      },
    ],
  },
);
