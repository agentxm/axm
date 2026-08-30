import * as Option from "effect/Option";

import { evaluateAxmSkillCompatibility } from "@agentxm/extension-management/unstable/skills";
import { parseSkillMd } from "@agentxm/registry-protocol/unstable/content";

export interface BundledAxmSkillContract {
  readonly version: string;
  readonly cliVersion: string;
  readonly cliVersionRange: string;
}

export const validateBundledAxmSkillContract = (
  manifestVersion: string,
  skillMd: string,
): BundledAxmSkillContract => {
  const parsedSkill = Option.getOrNull(parseSkillMd(skillMd, "axm"));
  if (parsedSkill === null) throw new Error("invalid bundled AXM SKILL.md");

  const compatibility = evaluateAxmSkillCompatibility({
    cliVersion: manifestVersion,
    skill: {
      manifestVersion,
      metadata: Option.getOrNull(parsedSkill.metadata),
      source: `workspace:@agentxm/skills/axm@${manifestVersion}`,
    },
  });
  if (
    compatibility.status !== "compatible" ||
    compatibility.declaredCliVersion === null ||
    compatibility.declaredCliVersionRange === null
  ) {
    throw new Error(
      `incompatible bundled AXM skill: ${compatibility.reasonCode ?? "unknown"}: ${compatibility.detail ?? "no detail"}`,
    );
  }

  return {
    version: manifestVersion,
    cliVersion: compatibility.declaredCliVersion,
    cliVersionRange: compatibility.declaredCliVersionRange,
  };
};
