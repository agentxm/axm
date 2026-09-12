import * as ServiceMap from "effect/Context";
import * as Data from "effect/Data";
import type { AxmSkillCompatibility, AxmSkillCompatibilityCandidate } from "../domain/index.js";

export interface AxmSkillCompatibilityPolicyInput {
  readonly fqn: string;
  readonly candidate: AxmSkillCompatibilityCandidate | null;
}

export interface AxmSkillCompatibilityPolicyService {
  readonly evaluate: (input: AxmSkillCompatibilityPolicyInput) => AxmSkillCompatibility | null;
}

export class AxmSkillCompatibilityPolicy extends ServiceMap.Service<
  AxmSkillCompatibilityPolicy,
  AxmSkillCompatibilityPolicyService
>()("@agentxm/cli-maintenance/official-skill/AxmSkillCompatibilityPolicy") {}

/** The AXM compatibility policy did not evaluate the official AXM skill. */
export class AxmSkillCompatibilityUnavailable extends Data.TaggedError(
  "AxmSkillCompatibilityUnavailable",
) {}
