/**
 * Extension-discovery feature: project package detectors, package-native
 * extension declarations, Registry recommendations, and discovery results.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export {
  type DiscoverResult,
  type DiscoverPackageResult,
  type DiscoverResultEntry,
} from "./discover.js";

export {
  detectedPackageName,
  DiscoverExtensions,
  DiscoverOutputSchema,
  type DiscoverOutput,
  type DiscoverExtensionsRequest,
  type DiscoverExtensionsResult,
} from "./discover-extensions.js";

export type { DetectedPackage, PackageDetector, PackageReader } from "./packaging/types.js";

export { detectPackages } from "./packaging/detect.js";
export { readLocalRecommendations } from "./packaging/read.js";
export { packageDetectors, packageReaders } from "./packaging/index.js";
