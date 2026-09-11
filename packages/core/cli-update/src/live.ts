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
export { UpdateCheckLive } from "./update-check/update-check.js";
