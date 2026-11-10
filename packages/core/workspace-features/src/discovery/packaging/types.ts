/**
 * Detector and reader interfaces for package-compatibility discovery.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as Effect from "effect/Effect";
import type * as Config from "effect/Config";
import type * as Option from "effect/Option";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type * as PlatformError from "effect/PlatformError";
import type { AgentExtensionRecommendation } from "@agentxm/extension-model/unstable/recommendations/agent-extensions";
import type { PackageType } from "@agentxm/extension-model/unstable/packaging/package-type";
import type { PackageUrlParts } from "@agentxm/extension-model/unstable/packaging/package-url";

/**
 * A package detected in a project directory.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface DetectedPackage {
  readonly purl: PackageUrlParts;
  readonly type: PackageType;
  /** File that produced this purl (for diagnostics). */
  readonly source: string;
  /** Dependency intent, distinct from the identity and version observed on disk. */
  readonly declaration?: { readonly name: string; readonly specifier: string };
  /** Adapters that resolve local packages carry their exact metadata location to readers. */
  readonly resolution?:
    | { readonly state: "resolved"; readonly metadataPath: string }
    | { readonly state: "unavailable" };
}

/**
 * Scans a project directory for packages of a specific type.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface PackageDetector {
  readonly type: PackageType;
  readonly detect: (
    projectDir: string,
  ) => Effect.Effect<
    ReadonlyArray<DetectedPackage>,
    PlatformError.PlatformError,
    FileSystem.FileSystem | Path.Path
  >;
}

/**
 * Reads local recommendation data from a detected package.
 *
 * @experimental This API is unstable and may change without notice.
 */
export interface PackageReader {
  readonly type: PackageType;
  readonly read: (
    pkg: DetectedPackage,
  ) => Effect.Effect<
    Option.Option<ReadonlyArray<AgentExtensionRecommendation>>,
    Config.ConfigError,
    FileSystem.FileSystem | Path.Path
  >;
}
