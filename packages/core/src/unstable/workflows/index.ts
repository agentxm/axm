/**
 * Workflow orchestration for extension management commands.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export {
  type InstallExtensionCommandWorkflowActions,
  runInstallCommandWorkflow,
} from "./install-command/workflow.js";

export {
  type UninstallExtensionCommandWorkflowActions,
  runUninstallCommandWorkflow,
} from "./uninstall-command/workflow.js";
