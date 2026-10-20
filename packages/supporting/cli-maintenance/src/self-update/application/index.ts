/** Self-update preparation, release selection, and the contracts their adapters implement. */
export { assessUpgrade, applyUpgrade } from "./upgrade.js";
export {
  InstallerInstructions,
  type InstallerInstructionsService,
} from "./installer-instructions.js";
export {
  ScriptReleaseAssets,
  ScriptExecutableInstaller,
  type StagedExecutable,
  type ExecutableReplacementLease,
  type ScriptExecutableInstallerService,
} from "./script-installer.js";
export { UpgradeFailed } from "./errors.js";
export {
  CliReleaseCatalog,
  type CliReleaseCatalogService,
  type SelectedRelease,
} from "./releases.js";
export { selectUpgradeRelease } from "./release-selection.js";
export { prepareUpgrade, type UpgradeRequest } from "./preparation.js";
export {
  InstallationInspection,
  type InstallationInspectionService,
  type InspectedInstallation,
} from "./installation.js";
export { UpgradeWorkingDirectory } from "./working-directory.js";
export { CommandRecordSchema, type CommandRecord } from "./evidence.js";
export { UpdateCheckCache, UpdateCheckUnavailable, LatestReleaseCheck } from "./update-cache.js";
export { checkStartupUpdate, rememberLatestRelease } from "./startup-check.js";

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
  type UpgradeSettlement,
  type UpgradePreviewIntent,
  type VerificationExecutable,
} from "./execution-result.js";

export {
  PackageInstaller,
  InstallationRecorder,
  type PackageInstallerService,
  // The CLI's execution observer infers this type, so its declaration emit
  // must be able to name it; knip skips exports tagged public.
  /** @public */
  type PackageManagedInstallation,
  type RegistryManagedInstallation,
  type InstallationInspectionPhase,
} from "./package-installer.js";

export {
  UpgradeExecutionObserver,
  type UpgradeExecutionObserverService,
} from "./execution-observer.js";
