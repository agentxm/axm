/**
 * Intent type for the subagent install command workflow.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Option from "effect/Option";
import type { SubagentExtensionRef } from "@axm.sh/core/unstable/subagents";
import type { VersionConstraint } from "@axm.sh/core/unstable/version-constraints";

/**
 * Describes the resolved intent to install one or more subagents.
 *
 * Produced by `finalizeIntent` after source resolution,
 * discovery, and selection. Consumed by `buildPlan`.
 */
export type InstallSubagentCommandIntent = {
  readonly subagentsToInstall: ReadonlyArray<{
    readonly ref: SubagentExtensionRef;
    readonly versionConstraint: Option.Option<VersionConstraint>;
  }>;
};
