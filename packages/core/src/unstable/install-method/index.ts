/**
 * Install method detection module.
 *
 * Determines how axm was installed (script, homebrew, npm, or unknown)
 * using a precedence chain of runtime signals.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export type {
  InstallMethodInputs,
  InstallMethodService,
  InstallMethodType,
} from "./install-method.js";
export {
  Homebrew,
  InstallMethod,
  InstallMethodLiteral,
  InstallMethodLive,
  InstallMethodTest,
  Npm,
  Script,
  Unknown,
  detectFromInputs,
} from "./install-method.js";
