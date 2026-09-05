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

import { makeWorkspaceInvariantFactsLive } from "@agentxm/extension-workspace";
import { toAppError } from "./app-error/conversions.js";
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
  recordingFileSystemLayer,
  type FileSystemWriteEvent,
  type TestPromptConfig,
  type TestPromptState,
} from "./test-helpers.js";
export { AuthLoginPresenterLive } from "./auth-login-presenter.js";

export {
  ensureWorkspaceFiles,
  writeWorkspaceFiles,
  writeKnowledgeExtension,
  computeMaterializedTreeIntegritySync,
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
export { handleAdopt } from "./root/adopt/command.js";
export { handleFork } from "./root/fork/command.js";
export { handleDemote } from "./root/demote/command.js";
export { handleImport } from "./root/import/command.js";
export { handleRootVersion, handleVersion } from "./root/shared/version-command.js";
export { handleLogin, LoginNoOpDocumentSchema } from "./root/auth/login.js";
// The credential store port and the session shape the login specifications
// observe; specs may not import the auth root directly.
export {
  AuthClient,
  CredentialStore,
  type MeResponse,
  type CreatePublishAuthorizationRequestParams,
} from "@agentxm/registry-auth";
export {
  AuthClientLive,
  CredentialStoreLive,
  PendingDeviceLoginStoreLive,
} from "@agentxm/registry-auth/live";
export { handleEnableHook } from "./root/hooks/enable.js";
export { handleDisableHook } from "./root/hooks/disable.js";
export { handleHooksNew } from "./root/hooks/new.js";
export { handleInstallHook } from "./root/hooks/install/handler.js";
export { handleUninstallHook } from "./root/hooks/uninstall/handler.js";
export { handleEnableRule } from "./root/rules/enable.js";
export { handleDisableRule } from "./root/rules/disable.js";
export { handleRulesNew } from "./root/rules/new.js";
export { handleInstallRule } from "./root/rules/install/handler.js";
export { handleUninstallRule } from "./root/rules/uninstall/handler.js";
export { handleKnowledgeNew } from "./root/knowledge/new.js";
export { handleKnowledgeInstall } from "./root/knowledge/install/command.js";
export { handleKnowledgeUninstall } from "./root/knowledge/uninstall/command.js";
export { handleKnowledgeUpdate } from "./root/knowledge/update.js";
export { setKnowledgeEnabled } from "./root/knowledge/activation.js";
export { handleMcpServersNew } from "./root/mcps/new.js";
export { handleEnableSubagent } from "./root/subagents/enable/handler.js";
export { handleDisableSubagent } from "./root/subagents/disable/handler.js";
export { handleInstall as handleSubagentsInstall } from "./root/subagents/install/handler.js";
export { handleUninstall as handleSubagentsUninstall } from "./root/subagents/uninstall/handler.js";
export { handleUpdate as handleSubagentsUpdate } from "./root/subagents/update/handler.js";
export { handleUpdate as handleSkillsUpdate } from "./root/skills/update/handler.js";
export { handleUninstall as handleSkillsUninstall } from "./root/skills/uninstall/handler.js";
export { handleInstallPack } from "./root/packs/install/handler.js";
export { handleUnpack } from "./root/packs/unpack/handler.js";
export { handleWorkspaceInstall } from "./root/install/workspace-install-handler.js";
export {
  CommandCapabilitiesAnnotation,
  readCommandCapabilities,
  registeredCommandCapabilities,
  type CommandCapabilities,
  type RegisteredCommandCapabilities,
} from "./root/shared/command-capabilities.js";
export { handleSync } from "./root/sync/handler.js";
export { handleUpdate } from "./root/update/handler.js";
export { ExtensionListDocumentSchema, handleList } from "./root/list/command.js";
export { handleView } from "./root/view/handler.js";
export { SetupDocumentSchema, handleSetup } from "./root/setup.js";
export { LintResultDocumentSchema, handleLint } from "./root/lint/handler.js";
export { runLintCommand, type RunLintCommandArgs } from "./root/lint/command.js";
// The executable lint catalog's observable metadata, exposed so accepted
// specifications can verify rule identities, defaults, and view membership
// without importing a feature root.
export {
  allCatalogRuleIds,
  allCatalogRuleMetadata,
  isolatedGitEnvironment,
} from "@agentxm/workspace-lint";
// The application's workspace-facts layer with its boundary failure
// rendering, for specification workspaces that compose manager layers
// directly rather than importing the kernel root.
export const workspaceInvariantFactsLive = makeWorkspaceInvariantFactsLive({
  describeFailure: (failure) => toAppError(failure).detail,
});
export {
  handleInstructionsDisable,
  handleInstructionsEnable,
  handleInstructionsStatus,
  InstructionsStatusOutputSchema,
} from "./root/instructions.js";
export { handleAgentsAdd } from "./root/agents/add.js";
export { handleAgentsRemove } from "./root/agents/remove.js";
export { handleAgentsList } from "./root/agents/list.js";
export { handleEnable as handleSkillsEnable } from "./root/skills/enable.js";
export { handleDisable as handleSkillsDisable } from "./root/skills/disable.js";
export { handleMcpsAdd } from "./root/mcps/add.js";
export { handleInstallMcpServer } from "./root/mcps/install/handler.js";
export { handleUninstallMcpServer } from "./root/mcps/uninstall/handler.js";
export { handleEnableMcpServer } from "./root/mcps/enable.js";
export { handleDisableMcpServer } from "./root/mcps/disable.js";
export { handleListMcpServers } from "./root/mcps/list.js";
export { handleMcpsImport, type McpsImportArgs } from "./root/mcps/import.js";
export { handleSkillsNew, type SkillsNewHandlerArgs } from "./root/skills/new.js";
export { handleSubagentsNew, type SubagentsNewHandlerArgs } from "./root/subagents/new/handler.js";
export { handleWorkspaceUpdate } from "./root/update/workspace-update-handler.js";
export { handlePacksAdd } from "./root/packs/add.js";
export { handlePacksRemove } from "./root/packs/remove.js";
export { handlePacksNew } from "./root/packs/new.js";
export { handlePacksShow } from "./root/packs/show.js";
export { handleUninstallPack } from "./root/packs/uninstall/handler.js";
export { handlePackActivation } from "./root/packs/activation.js";
export { handlePacksUpdate } from "./root/packs/update.js";
export { handleRootPublish } from "./root/publish/command.js";
// The published publish-result contract, so interface specifications can
// decode the rendered document against the schema machine consumers read.
export { PublishResultSchema } from "./root/publish/result.js";
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
export {
  resolveExactVersion,
  resolveLatestVersion,
  type VersionResolutionResult,
} from "./version-resolution/version-resolution.js";
export {
  UpgradeAssessmentResultSchema,
  UpgradeDocumentSchema,
  handleUpgrade,
} from "./root/upgrade/handler.js";
// Upgrade's delegation ports, so a specification can observe what the command
// narrates while it hands work to an external installer.
export {
  Subprocess,
  type CommandResult,
  type RunCommandOptions,
} from "./root/upgrade/subprocess.js";
export {
  Homebrew,
  Npm,
  Pnpm,
  Yarn,
  InstallMethod,
  Script,
  type InstallMethodType,
} from "./install-method/install-method.js";
export { InstallMeta, InstallMetaLive, type InstallMetaData } from "./install-meta/install-meta.js";
export { UpdateCheck, UpdateCheckLive } from "./update-check/update-check.js";
// Integration ports the setup harness composes; specs may not import the
// integration roots directly, so the harness re-exports the needed surface.
export { AgentExecutableResolver } from "@agentxm/agent-integration";
export { RegistryUrl, RegistryProblem } from "@agentxm/registry-client";
// Extension-sources surface the locator-grammar and publish specifications and
// the install harness consume; specs may not import the integration root or its
// /live module directly, so the harness re-exports it (the Live through the
// sanctioned test-support module).
export {
  GitDirectoryComparison,
  resolveSource,
  type GitDirectoryComparisonService,
  type GitDirectoryDifference,
} from "@agentxm/extension-sources";
export {
  ReleaseAgePosture,
  mcpSecretAccount,
  type ReleaseAgePostureValue,
} from "@agentxm/extension-lifecycle";
export { SourceHostProvidersLive } from "./test-helpers.js";
// Application-boundary vocabulary the specifications assert against: exit
// codes, the machine error envelope, telemetry mode, client, and published
// ingest contract schemas, and the captured renderer and flag layers. These
// modules are CLI-internal, so the harness is their sanctioned specification
// entry point.
export { AppError, ExitCodeDefinitions } from "./app-error/index.js";
export { JsonErrorEnvelopeSchema, classifyError } from "./cli-runtime/index.js";
export {
  OperationExitLive,
  ResolvePlanInteractionLive,
  getOperationExitCode,
} from "./cli-runtime/index.js";
export { NAMED_OVERRIDE_POLICIES, TestFlagsLayer, Verbosity } from "./cli-flags/index.js";
export {
  FrameLive,
  OutputStreams,
  ProgressEventSchema,
  Screen,
  ScreenLive,
  ScreenMachine,
  TestMachineRenderer,
  TestRenderer,
  asciiGlyphs,
  displayWidth,
  resolveCliOutputPolicy,
  stripTerminalFormatting,
  unicodeGlyphs,
  type TestRendererState,
} from "./screen/index.js";
// The published lifecycle event contract the machine progress channel carries;
// specs may not import the kernel root, so the harness re-exports it.
export { OperationEventSchema, type OperationEvent } from "@agentxm/workspace-operations";
export { handleList as handleSkillsList } from "./root/skills/list.js";
export { PromptCancelled } from "./prompt/prompt-cancelled.js";
export {
  TelemetryClient,
  TelemetryClientLive,
  TelemetryErrorsRequest,
  TelemetryEventsRequest,
  resolveTelemetryMode,
} from "./telemetry/index.js";
export {
  HookConfiguredAgentOutcomesProviderLive,
  HookManagerLive,
  InspectionFailureAdapterLive,
  KnowledgeIndexLive,
  KnowledgeManagerLive,
  LifecycleFailureAdapterLive,
  McpServerManagerLive,
  PackManagerLive,
  RuleManagerLive,
  SkillManagerLive,
  SubagentManagerLive,
} from "./test-helpers.js";

export { handleWhoami, WhoamiDocumentSchema } from "./root/auth/whoami.js";
export { handleLogout, LogoutDocumentSchema } from "./root/auth/logout.js";
export {
  handleToken,
  handleCreateToken,
  handleListTokens,
  handleRevokeToken,
  TokenDocumentSchema,
  CreatedTokenDocumentSchema,
  TokenListDocumentSchema,
  RevokeTokenDocumentSchema,
  type CreateTokenHandlerArgs,
} from "./root/auth/token.js";
export { withCliErrorHandling } from "./cli-runtime/runtime-envelope.js";
export { CommandArgv } from "./cli-runtime/command-argv.js";
export {
  reportCliError,
  reportCliDefect,
  trackCliCommand,
  trackCliCommandCompleted,
} from "./cli-runtime/telemetry.js";
export {
  PendingDeviceLoginStore,
  DeviceLoginCodeExpired,
  DeviceLoginDenied,
  RegistryAuthFailed,
  StepUpRequired,
  resolveRequestToken,
  type CredentialFile,
  type PendingDeviceLogin,
} from "@agentxm/registry-auth";

export { handleKnowledgeConceptSearch } from "./root/knowledge/concepts/search.js";
export { handleKnowledgeConceptQuery } from "./root/knowledge/concepts/query.js";
export { handleKnowledgeConceptGet } from "./root/knowledge/concepts/get.js";
export { handleKnowledgeConceptResolve } from "./root/knowledge/concepts/resolve.js";
export { handleKnowledgeConceptRelated } from "./root/knowledge/concepts/related.js";
export { handleKnowledgeConceptStatus } from "./root/knowledge/concepts/status.js";
export {
  KnowledgeConceptQueryPageSchema,
  KnowledgeConceptGetOutputSchema,
  KnowledgeConceptResolveOutputSchema,
  KnowledgeConceptRelatedOutputSchema,
  KnowledgeConceptStatusOutputSchema,
} from "./root/knowledge/concepts/schemas.js";
export { handleKnowledgeLint, KnowledgeLintQueryResultSchema } from "./root/knowledge/lint.js";
export {
  handleYank,
  handleUnyank,
  handleDeprecate,
  handleUndeprecate,
  LifecycleTransitionOutputSchema,
} from "./root/lifecycle/command.js";
export {
  handleVisibilityStatus,
  handleVisibilitySet,
  handleVisibilityReconcile,
} from "./root/visibility/handler.js";
export {
  handleCacheStatus,
  handleCacheVerify,
  handleCachePrune,
  CacheStatusOutputSchema,
  CacheVerifyOutputSchema,
  CachePruneOutputSchema,
} from "./root/cache/command.js";

export { resolveAxmCacheRoot } from "@agentxm/registry-client";

export { handleDiscover, DiscoverOutputSchema } from "./root/discover/handler.js";
export { ViewDocumentSchema, ViewFieldValueSchema } from "./root/view/handler.js";
export { handleExtensionShow, ExtensionShowResultSchema } from "./root/shared/extension-show.js";
export { handleListHook } from "./root/hooks/list.js";
export { handleListRule } from "./root/rules/list.js";
export { handleKnowledgeList, KnowledgeListQueryResultSchema } from "./root/knowledge/list.js";
export { handleList as handlePacksList } from "./root/packs/list.js";
export { handleListSubagents } from "./root/subagents/list/handler.js";
export { PackShowResultSchema } from "./root/packs/show.js";
export { ExtensionInventorySchema } from "@agentxm/workspace-state";
export {
  handleAgentsCapabilities,
  AgentCapabilitiesOutputSchema,
} from "./root/agents/capabilities.js";
export { AgentsListOutputSchema } from "./root/agents/list.js";
export { Unknown } from "./install-method/install-method.js";
export { mcpRegistryResolutionKey } from "@agentxm/workspace-state";

// Production environment and startup boundaries for environment specifications.
export { runtimeBaseLayer, resolveBuiltInSources } from "./runtime.js";
export { withUpdateCheck } from "./update-check-startup.js";
