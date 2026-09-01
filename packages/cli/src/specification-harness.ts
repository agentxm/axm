/**
 * In-memory application-boundary harness for executable specifications.
 *
 * This is a documented public API boundary consumed by the
 * `@agentxm/specifications` package: it exposes the real command handlers and
 * the controlled test context needed to run them in-process against a real
 * temporary workspace, without spawning a CLI process. Specifications drive
 * these entries and assert product-observable postconditions only.
 *
 * @experimental This API is unstable and may change without notice.
 */

export {
  makeCliTestContext,
  makeWorkspaceHandlerTestContext,
  makeEffectProvide,
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
  expectNoPlanEnvelope,
  planResultUnits,
  getAppError,
  type TestPromptConfig,
} from "./test-helpers.js";

export {
  ensureWorkspaceFiles,
  writeWorkspaceFiles,
  writeKnowledgeExtension,
  exactVersion,
  extensionName,
  versionRange,
} from "./test-stubs.js";

export {
  handleInstall,
  type RootInstallFlags,
  type RootInstallHandlerArgs,
} from "./root/install/handler.js";
export {
  handleInstall as handleSkillsInstall,
  type InstallHandlerArgs as SkillsInstallHandlerArgs,
  type InstallSkillFlags as SkillsInstallFlags,
} from "./root/skills/install/handler.js";
export { resolveRootInstallIntent } from "./root/install/resolve-root-install-intent.js";
export { PLAN_RESULT_CONTRACT, PlanResolutionDocumentSchema } from "./operation-output.js";
export { handleUninstall } from "./root/uninstall/handler.js";
export { handleSync } from "./root/sync/handler.js";
export { handleUpdate } from "./root/update/handler.js";
export { ExtensionListDocumentSchema, handleList } from "./root/list/command.js";
export { handleView } from "./root/view/handler.js";
export { SetupDocumentSchema, handleSetup } from "./root/setup.js";
export { LintResultDocumentSchema, handleLint } from "./root/lint/handler.js";
export {
  handleInstructionsDisable,
  handleInstructionsEnable,
  handleInstructionsStatus,
} from "./root/instructions.js";
export { handleAgentsAdd } from "./root/agents/add.js";
export { handleAgentsRemove } from "./root/agents/remove.js";
export { handleAgentsList } from "./root/agents/list.js";
export { handleEnable as handleSkillsEnable } from "./root/skills/enable.js";
export { handleDisable as handleSkillsDisable } from "./root/skills/disable.js";
export { handleMcpsAdd } from "./root/mcps/add.js";
export { handleUninstallMcpServer } from "./root/mcps/uninstall/handler.js";
export { handleEnableMcpServer } from "./root/mcps/enable.js";
export { handleDisableMcpServer } from "./root/mcps/disable.js";
export { handleListMcpServers } from "./root/mcps/list.js";
export { handlePacksAdd } from "./root/packs/add.js";
export { handlePacksRemove } from "./root/packs/remove.js";
export { handlePacksNew } from "./root/packs/new.js";
export { handlePacksShow } from "./root/packs/show.js";
export { handlePackActivation } from "./root/packs/activation.js";
export { handleRootPublish } from "./root/publish/command.js";
export { makeAxmFormatter } from "./formatter.js";
export { ExecutionDirectory, type ExecutionDirectoryService } from "./execution-directory.js";
export {
  TEST_VERSION,
  captureHelpDoc,
  captureHelpRequestDoc,
  collectCommandAliases,
  collectCommandPaths,
  collectHelpFiles,
  formatCommandPath,
} from "./command-tree-test-helpers.js";
export { rootCommand } from "./app.js";
// Workspace-state vocabulary the settings-contract and reachability
// specifications consume; specs may not import kernel roots directly, so the
// harness re-exports the needed surface (application code may compose
// anything).
export {
  LOCKFILE_VERSION,
  LockfileSchema,
  SETTINGS_KEY_ORDER,
  SettingsSchema,
  computePackManifestContentIdentity,
  writeSettingsAtPath,
} from "@agentxm/workspace-state";
// Extension-workspace surface the install and lint harnesses compose; specs
// may not import the kernel root or its /live module directly, so the harness
// re-exports it (the Live through the sanctioned test-support module).
export { makeAxmSkillCompatibilityPolicyLayer } from "@agentxm/extension-workspace";
export { CodingAgentRepositoryLive } from "./test-helpers.js";
export { HelpTopicResultSchema, handleHelpPath } from "./root/help/command.js";
export { loadVersion } from "./version.js";
