/**
 * Extension operation workflows — install and uninstall operation builders.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

// Install operation
export {
  type InstallOperationArgs,
  type UninstallRetentionPolicy,
  buildInstallOperation,
  targetFromRef,
  toLabel,
} from "./install-operation.js";

// Uninstall operation
export { type UninstallOperationArgs, buildUninstallOperation } from "./uninstall-operation.js";
