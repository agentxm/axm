/** Installation facts and upgrade decisions owned by CLI maintenance. */
export { selectReleaseChecksum, acceptsScriptExecutable } from "./script-verification.js";
export {
  Script,
  Homebrew,
  Npm,
  Pnpm,
  Yarn,
  Unknown,
  InstallMethodLiteral,
  type DetectionSource,
  type InstallMethodName,
  type InstallMethodType,
} from "./installation.js";
export {
  classifyVersionRelation,
  normalizeExactVersion,
  decideUpgrade,
  resolvePlatformBinary,
  supportedMethod,
  type PlatformBinaryInfo,
  type UpgradeAction,
  type VersionRelation,
} from "./policy.js";
export {
  availableStartupUpdate,
  isReleaseCacheStale,
  shouldSkipStartupCheck,
  type AvailableUpdate,
  type CachedLatestRelease,
  type StartupCheckContext,
} from "./startup-check.js";

export { methodName, methodExecutablePath } from "./installation.js";
export {
  verifyPackageInstallation,
  verifyHomebrewInstallation,
  shouldReinstallHomebrew,
} from "./verification.js";
