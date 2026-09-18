import {
  admittedSet,
  codeReview,
  publishFrame,
  reviewKit,
  reviewer,
  triage,
} from "./publish-results.js";

/**
 * The plan with `--verbose`: every row carries the evidence the default
 * leaves out — where its visibility came from, how its source compares with
 * Git HEAD, what its archive holds, and where it falls in dependency order —
 * so nothing the old narration printed is lost, only moved under its row.
 */
export const refPublishVerbose = publishFrame(
  {
    mode: "preview",
    publicationSet: admittedSet([codeReview, reviewer, reviewKit, triage]),
    results: [codeReview, reviewer, reviewKit, triage],
  },
  { verbosity: "verbose" },
);
