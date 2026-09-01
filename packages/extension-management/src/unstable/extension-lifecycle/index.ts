/**
 * Extension-lifecycle feature: configured-entry resolution policy and the
 * install/uninstall command workflows.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export {
  makeConfiguredReleaseAgeEvaluation,
  resolveConfiguredHook,
  resolveConfiguredKnowledge,
  resolveConfiguredMcpServer,
  resolveConfiguredPack,
  resolveConfiguredRule,
  resolveConfiguredSkill,
  resolveConfiguredSubagent,
  resolveConfiguredRegistryEntry,
} from "./configured-entry-resolution.js";

export {
  CONFIGURED_ENTRY_RESOLUTION_TIMEOUT,
  withConfiguredEntryResolutionTimeout,
} from "./resolution-timeout.js";

export {
  buildInstallCommandPlan,
  type InstallExtensionCommandWorkflowActions,
  runInstallCommandWorkflow,
} from "./workflows/install-command/workflow.js";

export {
  type UninstallExtensionCommandWorkflowActions,
  type UninstallWorkflowFlags,
  runUninstallCommandWorkflow,
} from "./workflows/uninstall-command/workflow.js";
