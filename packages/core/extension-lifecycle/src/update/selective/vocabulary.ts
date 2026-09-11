/**
 * What a selective update settles with.
 *
 * `skills update` and `subagents update` both settle as one of two things: a
 * frozen execution candidate, or the reason there is nothing to execute. The
 * reason is a bounded classification, never a rendered sentence plus
 * suggestions — the application decides what to offer a person for each one.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  resolveExecutionCandidate,
  type ExecutionCandidate,
  type PlanExecution,
  type PlanRiskCondition,
} from "@agentxm/workspace-operations";

import type { SelectiveUpdateStepRequirements } from "./requirements.js";
import type { SelectiveUpdateNothingReason } from "./selection.js";

/** Which extension type a selective update is about. */
export type SelectiveUpdateSubjectType = "skill" | "subagent";

/** The plan name each selective update reports under. */
export const selectiveUpdatePlanName = (type: SelectiveUpdateSubjectType): string =>
  type === "skill" ? "Update skills" : "Update subagents";

/**
 * Advancing outside the version ranges installed Packs declare is an override
 * a person states on the command line, so the plan carries it as a condition
 * the operator already met rather than a silent policy.
 */
export const ignoreVersionConstraintsCondition: PlanRiskCondition = {
  level: "override-required",
  id: "ignore-pack-version-constraints",
  policy: "ignore-version-constraints",
  requiredFlag: "--ignore-version-constraints",
  detail: "Allow updates outside version constraints declared by installed packs.",
};

/** A settled selective update that has work to execute. */
export interface PlannedSelectiveUpdateCandidate {
  readonly outcome: "planned";
  readonly subjectType: SelectiveUpdateSubjectType;
  readonly planName: string;
  readonly execution: ExecutionCandidate<SelectiveUpdateStepRequirements>;
}

/** A settled selective update with nothing to execute, and why. */
export interface NothingSelectiveUpdateCandidate {
  readonly outcome: "nothing";
  readonly reason: SelectiveUpdateNothingReason;
  readonly message: string;
  readonly subjectType: SelectiveUpdateSubjectType;
  readonly planName: string;
  readonly planDescription: string;
}

export type SelectiveUpdateCandidate =
  PlannedSelectiveUpdateCandidate | NothingSelectiveUpdateCandidate;

/** Preview or apply a settled selective update. */
export const previewOrApplySelectiveUpdate = (
  candidate: PlannedSelectiveUpdateCandidate,
  execution: PlanExecution,
) => resolveExecutionCandidate(candidate.execution, execution);
