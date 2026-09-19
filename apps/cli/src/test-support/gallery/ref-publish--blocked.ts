import type { PublishResultItem } from "@agentxm/workspace/publishing";

import {
  admittedSet,
  codeReview,
  publishFrame,
  reviewKit,
  reviewer,
} from "./samples/publish-results.js";

const notTried = (item: PublishResultItem): PublishResultItem => ({
  ...item,
  status: "blocked",
  reason: "blocked_by_preflight",
  blockedBy: [codeReview.id],
});

/**
 * A blocked publish (*Reference cases*, board `1 · Publish, contract-true`,
 * frame *Blocked — a working tree that differs from Git HEAD is a policy
 * override, not a warning*).
 *
 * The extension whose own source stopped the run keeps the attention mark and
 * says why; the ones behind it were never tried. The verdict is a callout,
 * because a person has to act: its reason sits beneath it, the exit code in
 * its aside, and each recovery is a copyable command.
 */
export const refPublishBlocked = publishFrame(
  {
    mode: "apply",
    publicationSet: admittedSet([codeReview, reviewer, reviewKit]),
    results: [
      {
        ...codeReview,
        status: "blocked",
        reason: "source_state_not_accepted",
        sourceState: {
          basis: "git-head",
          status: "differs-from-head",
          revision: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
          directory: "skills/code-review",
          differences: [
            { path: "SKILL.md", change: "modified" },
            { path: "scripts/review.py", change: "modified" },
            { path: "scripts/lint.py", change: "added" },
            { path: "notes.md", change: "deleted" },
          ],
          differenceCount: 4,
          truncated: false,
        },
      },
      notTried(reviewer),
      notTried(reviewKit),
    ],
    failure: {
      code: "usage",
      class: "user",
      message: "The archive for code-review is not fully represented by Git HEAD a1b2c3d.",
      retryable: false,
    },
  },
  {
    exitCode: 2,
    suggestions: [
      { description: "Publish what is committed", cmd: "git commit -a && axm publish" },
      { description: "Publish the working tree as it is", cmd: "axm publish --accept-warnings" },
    ],
  },
);
