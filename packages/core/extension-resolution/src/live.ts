/**
 * Implementation of the source-resolution composition port this package owns
 * the policy for.
 *
 * `@agentxm/extension-sources` declares the official AXM skill candidate gate
 * as a port because a supporting integration may not own AXM trust policy.
 * Resolution owns that policy, so the Live is composed here rather than at
 * the application boundary; the composition root only composes Layers.
 *
 * The catalog port's Live belongs to `@agentxm/workspace-projection`, which
 * owns the agent-selection facts it reads.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  AxmSkillCandidateGate,
  AxmSkillGateUnavailable,
  type AxmSkillCandidateVerdict,
} from "@agentxm/extension-sources";

import { evaluateAxmSkillCandidate } from "./axm-skill-candidate.js";
import {
  AXM_SKILL_BUNDLED_PREVIEW_COMMAND,
  formatAxmSkillCompatibilityTarget,
} from "./axm-skill-compatibility.js";
import type { AxmSkillCompatibilityUnavailable } from "./errors.js";

/**
 * The gate renders the recovery command and target exactly as the registry
 * host provider rendered them before the port existed. Its only failure is
 * the policy declining to evaluate, which travels in `cause` so the
 * application boundary renders the sentence it renders everywhere else.
 */
export const AxmSkillCandidateGateLive = Layer.succeed(AxmSkillCandidateGate, {
  evaluate: (candidate) =>
    evaluateAxmSkillCandidate({
      ref: candidate.ref,
      packageRoot: candidate.packageRoot,
      skillSourcePath: candidate.skillSourcePath,
    }).pipe(
      Effect.map((result): AxmSkillCandidateVerdict | null =>
        result === null
          ? null
          : {
              status: result.status,
              detail: result.detail,
              recoveryCommand:
                result.recovery.action === "update-registry-skill"
                  ? AXM_SKILL_BUNDLED_PREVIEW_COMMAND
                  : result.recovery.nextAction,
              recoveryTarget: formatAxmSkillCompatibilityTarget(result.recovery),
            },
      ),
      Effect.mapError(
        (failure: AxmSkillCompatibilityUnavailable) =>
          new AxmSkillGateUnavailable({
            category: "internal",
            detail: "AXM compatibility policy did not evaluate the official AXM skill",
            cause: failure,
          }),
      ),
    ),
});
