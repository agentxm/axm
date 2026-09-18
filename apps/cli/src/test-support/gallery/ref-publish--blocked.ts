import * as Option from "effect/Option";

import {
  makeOperationResolution,
  operationPresentation,
  type JobStepArtifact,
  type ResolvedUnit,
} from "@agentxm/workspace/transitions/planning";

import { operationDoc } from "../../operation-view.js";

const published = (version: string): JobStepArtifact => ({
  path: "",
  scope: "project",
  change: "created",
  version,
});

const ready = (id: string, version: string): ResolvedUnit<unknown> => ({
  id,
  label: id,
  state: "ready",
  artifact: published(version),
});

/**
 * A blocked operation (*Reference cases*, board `1 · Publish, contract-true`,
 * frame *Blocked — a working tree that differs from Git HEAD is a policy
 * override, not a warning*).
 *
 * The unit whose condition stopped the operation keeps the attention mark and
 * says why; the units behind it were never tried. The verdict is a callout,
 * because a person has to act: its reason sits beneath it, the exit code in
 * its aside, and each recovery is a copyable command.
 */
export const refPublishBlocked = operationDoc(
  makeOperationResolution({
    name: "Publish",
    description: Option.none(),
    mode: "apply",
    presentation: operationPresentation({
      imperative: "publish",
      past: "Published",
      gerund: "Publishing",
    }),
    atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
    units: [
      {
        id: "@acme/skills/code-review",
        label: "@acme/skills/code-review",
        state: "blocked",
        artifact: published("1.4.0"),
        message: "4 paths differ from HEAD",
        blocking: {
          class: "override-required",
          subject: "@acme/skills/code-review",
          phase: "confirmation",
          detail: "4 paths differ from HEAD",
        },
      },
      ready("@acme/subagents/reviewer", "0.9.0"),
      ready("@acme/packs/review-kit", "2.1.0"),
    ],
    blocking: {
      class: "override-required",
      subject: "@acme/skills/code-review",
      phase: "confirmation",
      detail: "The archive for code-review is not fully represented by Git HEAD a1b2c3d.",
    },
  }),
  {
    verbosity: "normal",
    suggestions: [
      { description: "Publish what is committed", cmd: "git commit -a && axm publish" },
      { description: "Publish the working tree as it is", cmd: "axm publish --accept-warnings" },
    ],
  },
);
