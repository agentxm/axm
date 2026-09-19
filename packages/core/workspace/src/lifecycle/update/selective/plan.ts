/**
 * Which selected entries a selective update actually advances.
 *
 * Every selected entry has already been re-resolved against its source. This
 * decides, per entry, whether the resolution differs from the accepted one:
 * a Git resolution compares tree hashes, a Registry resolution compares
 * versions and publisher bindings, a local resolution always advances, and an
 * entry the person forced advances regardless. An entry that matches what is
 * already accepted is reported as unchanged rather than reinstalled.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import type * as Option from "effect/Option";

import type { JobStepResult, Plan, PlannedJobStep } from "../../../transitions/planning/index.js";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import type { SkillLockEntry, SubagentLockEntry } from "../../../desired-state/index.js";

/** The accepted resolution shape both lock maps share for this comparison. */
type AcceptedEntry = SkillLockEntry | SubagentLockEntry;

/**
 * The facts the comparison reads off a resolved ref. Every ref kind either
 * carries a version, a tree hash, or neither; a workspace-authored ref names
 * no remote resolution at all and always advances.
 */
interface ResolvedRefFacts {
  readonly refType: SkillExtensionRef["refType"] | SubagentExtensionRef["refType"];
  readonly version?: string;
  readonly gitTreeSha?: string;
}

/**
 * Whether a resolution differs from what the workspace already accepted.
 */
const hasChanged = (ref: ResolvedRefFacts, accepted: AcceptedEntry): boolean => {
  if (ref.refType === "git-hosted") {
    return !(
      accepted.source.type === "git" &&
      "tree" in accepted.resolved &&
      accepted.resolved.tree === ref.gitTreeSha
    );
  }
  if (ref.refType === "registry") {
    return (
      accepted.source.type !== "registry" ||
      !("version" in accepted.resolved) ||
      ref.version !== accepted.resolved.version
    );
  }
  // Local and workspace sources carry no resolution to compare against, so
  // they always advance.
  return true;
};

const unchangedStep = <R>(label: string): PlannedJobStep<R> => ({
  readiness: "ready",
  label,
  run: Effect.succeed<JobStepResult>({
    result: "success",
    disposition: "unchanged",
    message: "already up to date",
  }),
});

/** One entry the plan may advance, with the identity the comparison uses. */
export interface SelectiveUpdateUnit<TOperation> {
  readonly name: string;
  readonly ref: ResolvedRefFacts;
  readonly force: boolean;
  readonly operation: TOperation;
}

/**
 * Build the advance plan for one selective update: one unbounded job whose
 * steps are the selected entries, each either unchanged or dispatched to the
 * install operation that advances it.
 */
export const buildSelectiveUpdatePlan = <TOperation, R>(
  units: ReadonlyArray<SelectiveUpdateUnit<TOperation>>,
  acceptedResolutions: Readonly<Record<string, AcceptedEntry | undefined>>,
  name: string,
  description: Option.Option<string>,
  makeStep: (operation: TOperation) => PlannedJobStep<R>,
): Plan<R> => ({
  _tag: "Plan",
  name,
  description,
  jobs: [
    {
      concurrency: "unbounded",
      steps: units.map((unit): PlannedJobStep<R> => {
        const accepted = acceptedResolutions[unit.name];
        const needsUpdate = accepted === undefined || unit.force || hasChanged(unit.ref, accepted);
        return needsUpdate
          ? { ...makeStep(unit.operation), label: unit.name }
          : unchangedStep<R>(unit.name);
      }),
    },
  ],
});
