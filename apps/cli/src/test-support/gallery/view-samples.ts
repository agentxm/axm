import * as DateTime from "effect/DateTime";

import type { ViewDocument } from "@agentxm/workspace/inspection";

/** One published version, all published the same day; the page shows versions, not dates. */
const published = (version: string) => ({
  version,
  published: DateTime.makeUnsafe("2026-08-01T00:00:00Z"),
});

/** A current, public skill with a long release history. */
export const codeReview: ViewDocument = {
  handle: "@acme/skills/code-review",
  owner: "@acme",
  type: "skill",
  name: "code-review",
  description:
    "Reviews a diff for correctness, missing tests and style before you open a pull request.",
  latest: published("1.4.0"),
  versions: [
    "1.4.0",
    "1.3.2",
    "1.3.1",
    "1.3.0",
    "1.2.0",
    "1.1.2",
    "1.1.1",
    "1.1.0",
    "1.0.3",
    "1.0.2",
    "1.0.1",
    "1.0.0",
    "0.9.0",
    "0.8.0",
  ].map(published),
  install: "axm skills install @acme/skills/code-review",
  visibility: "public",
  deprecation: null,
};

/** A deprecated skill whose owner names an available replacement. */
export const changelog: ViewDocument = {
  handle: "@legacy/skills/changelog",
  owner: "@legacy",
  type: "skill",
  name: "changelog",
  latest: published("0.3.0"),
  versions: ["0.3.0", "0.2.0", "0.1.0"].map(published),
  install: "axm skills install @legacy/skills/changelog",
  visibility: "public",
  deprecation: {
    deprecatedAt: DateTime.makeUnsafe("2026-08-02T00:00:00Z"),
    message: "Superseded by release notes that read the pull requests, not the log.",
    replacement: { status: "available", fqn: "@acme/skills/release-notes" },
  },
};
