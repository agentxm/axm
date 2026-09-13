/**
 * Environment-backed Layers for the self-update capability. The application
 * composes these once, at its composition root.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { InstallMethodLive } from "../../adapters/native/install-method/install-method.js";
export { InstallMetaLive } from "../../adapters/native/install-meta/install-meta.js";
export { SubprocessLive } from "../../adapters/native/subprocess/subprocess.js";
export { makeUpdateCheckCacheLayer } from "./update-cache.js";

export { UpgradePreparationLive } from "./preparation.js";

export { PackageInstallationLive } from "./package-installation.js";
export { ScriptInstallationLive } from "./script-installation.js";
