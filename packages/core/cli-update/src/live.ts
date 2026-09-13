/**
 * Environment-backed Layers for the self-update capability. The application
 * composes these once, at its composition root.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { InstallMethodLive } from "./install-method/install-method.js";
export { InstallMetaLive } from "./install-meta/install-meta.js";
export { SubprocessLive } from "./subprocess/subprocess.js";
export { UpdateCheckCacheLive } from "./composition/update-cache.js";

export { UpgradePreparationLive } from "./composition/preparation.js";

export { PackageInstallationLive } from "./composition/package-installation.js";
export { ScriptInstallationLive } from "./composition/script-installation.js";
