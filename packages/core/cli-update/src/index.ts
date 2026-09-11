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

export { UpgradeFailed } from "./errors.js";

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
  decideUpgrade,
  methodLabel,
  parseChecksum,
  resolvePlatformBinary,
  resultMessage,
  upgradePlanSteps,
  type CommandRecord,
  type PlatformBinaryInfo,
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
  Homebrew,
  Npm,
  Pnpm,
  Script,
  Unknown,
  Yarn,
  detectFromInputs,
  type DetectionSource,
  type InstallMethodInputs,
  type InstallMethodName,
  type InstallMethodService,
  type InstallMethodType,
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
  DEFAULT_GITHUB_REPO,
  resolveExactVersion,
  resolveLatestVersion,
  type ResolvedRelease,
  type VersionRelation,
  type VersionResolutionResult,
} from "./version-resolution/version-resolution.js";

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
