/**
 * Version resolution feature module.
 *
 * Provides logic for resolving the latest CLI version from GitHub Releases
 * and comparing it against the local version.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export type { VersionResolutionResult } from "./version-resolution.js";
export { resolveLatestVersion, DEFAULT_GITHUB_REPO } from "./version-resolution.js";
