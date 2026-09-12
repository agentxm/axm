/** Self-update preparation, release selection, and the contracts their adapters implement. */
export { UpgradeFailed } from "./errors.js";
export {
  CliReleaseCatalog,
  type CliReleaseCatalogService,
  type ResolvedRelease,
  type SelectedRelease,
  type VersionResolutionResult,
} from "./releases.js";
export { selectUpgradeRelease, type UpgradeReleaseRequest } from "./release-selection.js";
export { prepareUpgrade, type UpgradeRequest, type UpgradeCandidate } from "./preparation.js";
export {
  InstallationInspection,
  type InstallationInspectionService,
  type InspectedInstallation,
} from "./installation.js";
export {
  UpgradeWorkingDirectory,
  type UpgradeWorkingDirectoryService,
} from "./working-directory.js";
export { CommandRecordSchema, type CommandRecord } from "./evidence.js";
export {
  UpdateCheckCache,
  UpdateCheckUnavailable,
  StableChannelCheck,
  type StableChannelCheckResult,
} from "./update-cache.js";
export {
  checkStartupUpdate,
  refreshStartupUpdate,
  rememberStableChannel,
  type StartupUpdateCheckOptions,
  type StartupUpdateCheckOutcome,
} from "./startup-check.js";

export {
  HomebrewFailureSchema,
  InstallMethodSchema,
  RecommendedCommandSchema,
  UpgradeCoreResultSchema,
  VerificationExecutableSchema,
  type HomebrewFailure,
  type InstallerAvailability,
  type RecommendedCommand,
  type ResultInstallMethod,
  type ResultStatus,
  type UpgradeCoreResult,
  type UpgradeSettlement,
  type VerificationExecutable,
} from "./execution-result.js";
