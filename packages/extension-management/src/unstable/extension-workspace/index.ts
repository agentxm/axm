/**
 * Extension-workspace public surface: the per-extension-type lifecycle
 * manager contract and the layer's failure vocabulary.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export type { ExtensionManager, MaterializationObservation } from "./extension-manager.js";
export {
  WriteBackupRetained,
  type ExtensionManagerFailure,
  type ExtensionWorkspaceError,
} from "./errors.js";
