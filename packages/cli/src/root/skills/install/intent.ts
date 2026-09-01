/**
 * Intent type for the skill install command workflow.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Option from "effect/Option";
import type { SkillExtensionRef } from "@agentxm/extension-management/unstable/workspace";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";

/**
 * Describes the resolved intent to install one or more skills.
 *
 * Produced by `finalizeSkillInstallIntent` after source resolution,
 * discovery, and selection.
 */
export type InstallSkillCommandIntent = {
  readonly skillsToInstall: ReadonlyArray<{
    readonly ref: SkillExtensionRef;
    readonly versionRange: Option.Option<VersionRange>;
  }>;
  /** Re-materialize even when the canonical tree already matches the lockfile. */
  readonly force?: boolean;
};
