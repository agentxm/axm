import * as Option from "effect/Option";

import {
  makeOperationResolution,
  operationPresentation,
  type JobStepArtifact,
  type ResolvedUnit,
} from "@agentxm/workspace/transitions/planning";

import { operationDoc } from "../../operation-view.js";

const installed = (version: string): JobStepArtifact => ({
  path: "",
  scope: "project",
  change: "created",
  version,
});

const notTried = (id: string, version: string): ResolvedUnit<unknown> => ({
  id,
  label: id,
  state: "blocked",
  artifact: installed(version),
  message: "not attempted: the operation was interrupted",
  blocking: {
    class: "operation-aborted",
    subject: id,
    phase: "apply",
    detail: "not attempted: the operation was interrupted",
    reference: "interruption",
  },
});

/**
 * Interrupted mid-apply (*Reference cases*, board `4 · Going wrong
 * mid-flight`, frame *ctrl-c during apply — the live ledger settles into
 * rolled-back rows*).
 *
 * The ledger the operation was streaming settles into the result: the unit
 * that had installed and the one in flight both roll back, and the two the
 * interruption reached first were never tried. The verdict is toned and
 * carries the exit code a script sees; rerunning is safe because nothing is
 * half-applied.
 */
export const refMidflightInterrupted = operationDoc(
  makeOperationResolution({
    name: "Install",
    description: Option.none(),
    mode: "apply",
    presentation: operationPresentation({
      imperative: "install",
      past: "Installed",
      gerund: "Installing",
    }),
    atomicity: { declared: "closure-atomic", applied: "closure-atomic" },
    units: [
      {
        id: "@acme/skills/code-review",
        label: "@acme/skills/code-review",
        state: "rolled-back",
        disposition: "restored",
        artifact: installed("1.4.0"),
      },
      {
        id: "@acme/skills/triage",
        label: "@acme/skills/triage",
        state: "interrupted",
        disposition: "restored",
        artifact: installed("2.0.1"),
        message: "interrupted while in flight; effects were restored",
      },
      notTried("@acme/subagents/reviewer", "0.9.0"),
      notTried("@acme/packs/review-kit", "2.1.0"),
    ],
    interruption: { signal: "SIGINT", disposition: "restored" },
  }),
  {
    verbosity: "normal",
    suggestions: [
      {
        description: "Run it again; nothing is half-applied",
        cmd: "axm install @acme/packs/review-kit",
      },
    ],
  },
);
