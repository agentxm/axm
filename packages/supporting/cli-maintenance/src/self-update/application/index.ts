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

export { applyPackageUpgrade, type PackageUpgradeInput } from "./apply-package-upgrade.js";
export {
  upgradeBaseFacts,
  detectionResult,
  noMutationResult,
  type BaseResultInput,
} from "./execution-facts.js";
export {
  PackageInstaller,
  InstallationRecorder,
  type PackageInstallerService,
  type PackageManagedInstallation,
  type RegistryManagedInstallation,
  type AvailabilityObservation,
  type PackageInstallationObservation,
  type PackageMutationObservation,
  type InstallationInspectionPhase,
} from "./package-installer.js";

export {
  UpgradeExecutionObserver,
  type UpgradeExecutionObserverService,
  type UpgradeExecutionStage,
} from "./execution-observer.js";
