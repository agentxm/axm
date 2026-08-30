/**
 * Workflow orchestration for extension management commands.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export {
  buildInstallCommandPlan,
  type InstallExtensionCommandWorkflowActions,
  runInstallCommandWorkflow,
} from "./install-command/workflow.js";

export {
  type UninstallExtensionCommandWorkflowActions,
  type UninstallWorkflowFlags,
  runUninstallCommandWorkflow,
} from "./uninstall-command/workflow.js";
