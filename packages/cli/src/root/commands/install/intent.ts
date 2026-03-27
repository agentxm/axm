/**
 * Install command intent type.
 *
 * Immutable intent payload for the `axm commands install` workflow.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type * as Option from "effect/Option";
import type { CommandExtensionRef } from "@axm.sh/core/unstable/extensions";

/**
 * Intent for installing a command extension.
 */
export interface InstallCommandCommandIntent {
  readonly ref: CommandExtensionRef;
  readonly versionConstraint: Option.Option<string>;
  readonly force: boolean;
}
