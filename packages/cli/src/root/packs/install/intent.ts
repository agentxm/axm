/**
 * Pack install command intent type.
 *
 * Captures the validated inputs needed to build a pack install plan.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Option from "effect/Option";
import type { PackRef } from "@agentxm/client-core/unstable/packs";
import type { VersionRange } from "@agentxm/client-core/unstable/version-constraints";

export interface InstallPackCommandIntent {
  readonly packToInstall: PackRef;
  readonly versionRange: Option.Option<VersionRange>;
  readonly diagnosticLines?: ReadonlyArray<string>;
}
