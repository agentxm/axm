import * as Layer from "effect/Layer";
import { AxmSkillCompatibilityPolicy } from "../application/index.js";
import { AXM_SKILL_FQN, evaluateAxmSkillCompatibility } from "../domain/index.js";

export const makeAxmSkillCompatibilityPolicyLayer = (
  cliVersion: string | null,
): Layer.Layer<AxmSkillCompatibilityPolicy> =>
  Layer.succeed(AxmSkillCompatibilityPolicy, {
    evaluate: (input) =>
      input.fqn === AXM_SKILL_FQN
        ? evaluateAxmSkillCompatibility({ cliVersion, skill: input.candidate })
        : null,
  });
