/**
 * Compatibility-policy-backed implementation of source resolution's official
 * AXM skill candidate gate.
 *
 * Lives with the application runtime: the extension-sources integration
 * declares the port and the extension-workspace kernel owns the
 * compatibility policy, so only the composition root may see both. The Live
 * renders the recovery command and target exactly as the registry host
 * provider rendered them before the port existed.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  AXM_SKILL_BUNDLED_PREVIEW_COMMAND,
  evaluateAxmSkillCandidate,
  formatAxmSkillCompatibilityTarget,
} from "@agentxm/extension-workspace";
import {
  AxmSkillCandidateGate,
  AxmSkillGateUnavailable,
  type AxmSkillCandidateVerdict,
} from "@agentxm/extension-sources";
import { toAppError } from "../app-error/conversions.js";

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
      Effect.mapError((failure) => {
        const rendered = toAppError(failure);
        return new AxmSkillGateUnavailable({
          category: rendered.code,
          detail: rendered.detail,
          ...(rendered.suggestions === undefined ? {} : { suggestions: rendered.suggestions }),
          cause: rendered.cause,
        });
      }),
    ),
});
