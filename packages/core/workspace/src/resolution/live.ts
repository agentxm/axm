import { renderAxmSkillRecovery } from "@agentxm/cli-maintenance/official-skill/adapters/cli";
/**
 * Implementations of the source-resolution composition ports this package
 * owns the policy for.
 *
 * `@agentxm/workspace/resolution/sources` declares the official AXM skill
 * candidate gate and the Registry resolution policy as ports because a
 * supporting integration may not own AXM trust policy or release-age
 * admission. Resolution owns both policies, so their Lives are composed here
 * rather than at the application boundary; the composition root and every
 * fixture that composes the production managers only compose Layers.
 *
 * The catalog port's Live belongs to `@agentxm/workspace/projection`, which
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
  RegistryResolutionPolicy,
  type AxmSkillCandidateVerdict,
} from "./sources/index.js";

import { evaluateAxmSkillCandidate } from "./axm-skill-candidate.js";
import {
  decideNamedRegistryVersion,
  namedRegistryCandidates,
} from "./named-registry-resolution.js";
import {
  AXM_SKILL_BUNDLED_PREVIEW_COMMAND,
  formatAxmSkillCompatibilityTarget,
} from "@agentxm/cli-maintenance/official-skill/adapters/cli";
import type { AxmSkillCompatibilityUnavailable } from "@agentxm/cli-maintenance/official-skill/application";

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
                  : renderAxmSkillRecovery(result.recovery).nextAction,
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

/**
 * Which version a named Registry request selects under the minimum-release-age
 * policy, and the candidates a provider verifies in turn when selection
 * depends on archive content. One binding, so no fixture restates it.
 */
export const RegistryResolutionPolicyLive = Layer.succeed(RegistryResolutionPolicy, {
  decideNamedVersion: decideNamedRegistryVersion,
  namedCandidates: namedRegistryCandidates,
});
