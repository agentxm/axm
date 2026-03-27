/**
 * Pack uninstall command intent type.
 *
 * Captures the validated inputs needed to build a pack uninstall plan.
 * Supports multiple packs for glob expansion.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { PackExtensionTarget } from "@axm.sh/core/unstable/workspace";

export interface UninstallPackCommandIntent {
  readonly packsToUninstall: ReadonlyArray<PackExtensionTarget>;
}
