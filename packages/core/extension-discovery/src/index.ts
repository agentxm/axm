/**
 * Extension-discovery feature: project package detectors, package-native
 * extension declarations, Registry recommendations, and discovery results.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export {
  discover,
  type DiscoverResult,
  type DiscoverPackageResult,
  type DiscoverResultEntry,
} from "./discover.js";

export type { DetectedPackage, PackageDetector, PackageReader } from "./packaging/types.js";

export { detectPackages } from "./packaging/detect.js";
export { readLocalRecommendations } from "./packaging/read.js";
export { packageDetectors, packageReaders } from "./packaging/index.js";
