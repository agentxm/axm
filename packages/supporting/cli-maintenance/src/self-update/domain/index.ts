/** Installation facts and upgrade decisions owned by CLI maintenance. */
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
  type UnknownReason,
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
