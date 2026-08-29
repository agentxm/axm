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
