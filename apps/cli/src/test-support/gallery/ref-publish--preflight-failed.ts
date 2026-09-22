import type { PublishResultItem } from "@agentxm/workspace/publishing";

import { admittedSet, codeReview, publishFrame } from "./samples/publish-results.js";

const failed: PublishResultItem = {
  ...codeReview,
  action: "error",
  status: "failed",
  reason: "candidate_invalid",
  message: "skill.json is missing a required version.",
};

/** A preview that finds a package problem before any upload begins. */
export const refPublishPreflightFailed = publishFrame(
  {
    mode: "preview",
    publicationSet: admittedSet([failed]),
    results: [failed],
  },
  { exitCode: 1 },
);
