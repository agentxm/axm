/**
 * Install command intent type.
 *
 * Immutable intent payload for the `axm commands install` workflow.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Option from "effect/Option";
import type { CommandExtensionRef } from "@agentxm/client-core/unstable/commands";
import type { VersionConstraint } from "@agentxm/client-core/unstable/version-constraints";

/**
 * Intent for installing a command extension.
 */
export interface InstallCommandCommandIntent {
  readonly ref: CommandExtensionRef;
  readonly versionConstraint: Option.Option<VersionConstraint>;
  readonly force: boolean;
}
