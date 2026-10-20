/**
 * Native installation inspection, update-cache storage, and verified replacement
 * of the installed `axm` executable. CLI maintenance owns upgrade preparation
 * and the application contracts these adapters implement.
 *
 * The capability owns its own process lock and atomic executable replacement:
 * it acts on a file outside any workspace, so it is deliberately not a
 * `@agentxm/workspace-kernel/settlement` closure.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { HOMEBREW_FORMULA } from "./package-installers/commands.js";

export { InstallMethod } from "./install-method/install-method.js";

export { InstallMeta, type InstallMetaData } from "./install-meta/install-meta.js";

export {
  // The CLI's self-update layer infers this service, so its declaration emit
  // must be able to name it; knip skips exports tagged public.
  /** @public */
  Subprocess,
  type CommandResult,
} from "./subprocess/subprocess.js";
