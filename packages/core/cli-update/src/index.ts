/**
 * The AXM self-update capability: install-ownership detection, release
 * selection from the promoted stable channel or an exact version, the startup
 * update check, and the verified upgrade of the installed `axm` executable.
 *
 * The capability owns its own process lock and atomic executable replacement:
 * it acts on a file outside any workspace, so it is deliberately not a
 * `@agentxm/workspace-transactions` closure.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export {
  AssessUpgrade,
  PerformUpgrade,
  type UpgradeCandidate,
  type UpgradeExecution,
  type UpgradeRequest,
} from "./upgrade/use-case.js";

export {
  HOMEBREW_FORMULA,
  HOMEBREW_TAP,
  UpgradeAssessmentResultSchema,
  methodLabel,
  parseChecksum,
  resultMessage,
  upgradePlanSteps,
  type CommandRecord,
  type ResultStatus,
  type UpgradeAssessmentResult,
  type UpgradeCoreResult,
} from "./upgrade/mechanism.js";

export {
  UpgradeWorkingDirectory,
  type UpgradeWorkingDirectoryService,
} from "./upgrade/working-directory.js";

export {
  InstallMethod,
  detectFromInputs,
  type InstallMethodInputs,
  type InstallMethodService,
} from "./install-method/install-method.js";

export {
  InstallMeta,
  readInstallMeta,
  writeInstallMeta,
  type InstallMetaData,
  type InstallMetaService,
} from "./install-meta/install-meta.js";

export {
  Subprocess,
  type CommandResult,
  type RunCommandOptions,
  type SubprocessService,
} from "./subprocess/subprocess.js";

export {
  UPDATE_CHECK_CACHE_SCHEMA,
  UpdateCheck,
  UpdateCheckCacheSchema,
  notificationMessage,
  shouldSkip,
  type NotificationAudience,
  type SkipCheckContext,
  type UpdateCheckCache,
  type UpdateCheckCacheState,
  type UpdateCheckService,
} from "./update-check/update-check.js";

export {
  StartupUpdateCheck,
  noUpdateCheckEnvironment,
  refreshCache,
  type StartupUpdateCheckOptions,
  type StartupUpdateCheckOutcome,
  type UpdateNotification,
} from "./startup-check/startup-check.js";
