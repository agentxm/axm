/**
 * Intent type for the skill install command workflow.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Option from "effect/Option";
import type { SkillExtensionRef } from "@axm.sh/core/unstable/skills";
import type { VersionConstraint } from "@axm.sh/core/unstable/version-constraints";

/**
 * Describes the resolved intent to install one or more skills.
 *
 * Produced by `finalizeSkillInstallIntent` after source resolution,
 * discovery, and selection. Consumed by `buildSkillInstallPlan`.
 */
export type InstallSkillCommandIntent = {
  readonly skillsToInstall: ReadonlyArray<{
    readonly ref: SkillExtensionRef;
    readonly versionConstraint: Option.Option<VersionConstraint>;
  }>;
};
