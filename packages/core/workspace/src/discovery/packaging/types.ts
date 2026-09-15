/**
 * Detector and reader interfaces for package-compatibility discovery.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import type { PackageExtensionDeclaration } from "@agentxm/registry-client";
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
  ) => Effect.Effect<ReadonlyArray<DetectedPackage>, never, FileSystem.FileSystem | Path.Path>;
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
    Option.Option<ReadonlyArray<PackageExtensionDeclaration>>,
    never,
    FileSystem.FileSystem | Path.Path
  >;
}
