/**
 * Native installation inspection, update-cache storage, and verified replacement
 * of the installed `axm` executable. CLI maintenance owns upgrade preparation
 * and the application contracts these adapters implement.
 *
 * The capability owns its own process lock and atomic executable replacement:
 * it acts on a file outside any workspace, so it is deliberately not a
 * `@agentxm/workspace-transactions` closure.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { AssessUpgrade, previewOrApply, type UpgradeExecution } from "./upgrade/use-case.js";

export { parseChecksum } from "./upgrade/mechanism.js";
export { HOMEBREW_FORMULA, HOMEBREW_TAP } from "./adapters/package-installers/commands.js";

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
