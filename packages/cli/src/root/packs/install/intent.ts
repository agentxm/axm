/**
 * Pack install command intent type.
 *
 * Captures the validated inputs needed to build a pack install plan.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Option from "effect/Option";
import type { PackDependencyRefResolver } from "@agentxm/extension-management/unstable/packs";
import type { PackRef } from "@agentxm/extension-management/unstable/workspace";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import type { ReleaseAgeEvaluation } from "@agentxm/registry-protocol/unstable/registry/release-age-policy";

export interface InstallPackCommandIntent {
  readonly packToInstall: PackRef;
  readonly versionRange: Option.Option<VersionRange>;
  readonly unattended?: boolean;
  readonly releaseAgeEvaluation?: ReleaseAgeEvaluation;
  readonly releaseAgeHoldbackBehavior?: "continue" | "preserve-or-block";
  /** Immutable dependency authority supplied by deterministic recovery workflows. */
  readonly dependencyResolver?: PackDependencyRefResolver;
  /** Render shared aggregate projections after a larger enclosing transition. */
  readonly deferProjections?: boolean;
  /**
   * Reacquire the Pack's canonical content instead of reusing the installed
   * tree. Recovery sets this because the observed tree already diverged from
   * the accepted resolution, so reusing it would preserve the divergence.
   */
  readonly forceCanonical?: boolean;
}
