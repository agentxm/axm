/**
 * Uninstall command intent type.
 *
 * Immutable intent payload for the `axm commands uninstall` workflow.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { CommandExtensionTarget } from "../../../workflows/install-operation/index.js";

/**
 * Intent for uninstalling a command extension.
 */
export interface UninstallCommandCommandIntent {
  readonly targets: ReadonlyArray<CommandExtensionTarget>;
}
