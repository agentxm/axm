/**
 * Install command intent type.
 *
 * Immutable intent payload for the `axm commands install` workflow.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Option from "effect/Option";
import type { CommandExtensionRef } from "@agentxm/client-core/unstable/commands";
import type { VersionRange } from "@agentxm/client-core/unstable/version-constraints";

/**
 * Intent for installing a command extension.
 */
export interface InstallCommandCommandIntent {
  readonly refs: ReadonlyArray<{
    readonly ref: CommandExtensionRef;
    readonly versionRange: Option.Option<VersionRange>;
  }>;
  readonly force: boolean;
}
