/**
 * Packaging schemas for purl-based package identification.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { PackageTypeSchema, type PackageType } from "./package-type.js";

export {
  formatPackageDisplay,
  PackageUrlPartsSchema,
  PackageUrlSchema,
  type PackageUrlParts,
} from "./package-url.js";

export type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

export { detectPackages } from "./detect.js";

export { readLocalRecommendations } from "./read.js";

export { purlIdentityMatch, purlMatch } from "./purl-match.js";

export {
  AxmPackageMetaSchema,
  PackageExtensionDeclarationSchema,
  type AxmPackageMeta,
  type PackageExtensionDeclaration,
} from "./axm-package-meta.js";

// Tier 1
import { npmDetector, npmReader } from "./npm.js";
import { golangDetector, golangReader } from "./golang.js";
import { pypiDetector, pypiReader } from "./pypi.js";

// Tier 2
import { cargoDetector, cargoReader } from "./cargo.js";
import { gemDetector, gemReader } from "./gem.js";
import { mavenDetector, mavenReader } from "./maven.js";
import { nugetDetector, nugetReader } from "./nuget.js";

// Tier 3
import { composerDetector, composerReader } from "./composer.js";
import { swiftDetector, swiftReader } from "./swift.js";
import { hexDetector, hexReader } from "./hex.js";
import { pubDetector, pubReader } from "./pub.js";
import { dockerDetector, dockerReader } from "./docker.js";
import { cocoapodsDetector, cocoapodsReader } from "./cocoapods.js";
import { condaDetector, condaReader } from "./conda.js";

// Tier 4
import { conanDetector, conanReader } from "./conan.js";
import { cranDetector, cranReader } from "./cran.js";
import { huggingfaceReader } from "./huggingface.js";
import { cpanDetector, cpanReader } from "./cpan.js";
import { hackageDetector, hackageReader } from "./hackage.js";
import { juliaDetector, juliaReader } from "./julia.js";
import { luarocksDetector, luarocksReader } from "./luarocks.js";
import { opamDetector, opamReader } from "./opam.js";
import { bazelDetector, bazelReader } from "./bazel.js";

// Tier 5
import { zigDetector, zigReader } from "./zig.js";
import { jsrDetector, denoReader } from "./jsr.js";
import { mojoDetector, mojoReader } from "./mojo.js";

import type { PackageDetector, PackageReader } from "./types.js";

export {
  // Tier 1
  npmDetector,
  npmReader,
  golangDetector,
  golangReader,
  pypiDetector,
  pypiReader,
  // Tier 2
  cargoDetector,
  cargoReader,
  gemDetector,
  gemReader,
  mavenDetector,
  mavenReader,
  nugetDetector,
  nugetReader,
  // Tier 3
  composerDetector,
  composerReader,
  swiftDetector,
  swiftReader,
  hexDetector,
  hexReader,
  pubDetector,
  pubReader,
  dockerDetector,
  dockerReader,
  cocoapodsDetector,
  cocoapodsReader,
  condaDetector,
  condaReader,
  // Tier 4
  conanDetector,
  conanReader,
  cranDetector,
  cranReader,
  huggingfaceReader,
  cpanDetector,
  cpanReader,
  hackageDetector,
  hackageReader,
  juliaDetector,
  juliaReader,
  luarocksDetector,
  luarocksReader,
  opamDetector,
  opamReader,
  bazelDetector,
  bazelReader,
  // Tier 5
  zigDetector,
  zigReader,
  jsrDetector,
  denoReader,
  mojoDetector,
  mojoReader,
};

/**
 * All registered package detectors.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const packageDetectors: ReadonlyArray<PackageDetector> = [
  // Tier 1
  npmDetector,
  golangDetector,
  pypiDetector,
  // Tier 2
  cargoDetector,
  gemDetector,
  mavenDetector,
  nugetDetector,
  // Tier 3
  composerDetector,
  swiftDetector,
  hexDetector,
  pubDetector,
  dockerDetector,
  cocoapodsDetector,
  condaDetector,
  // Tier 4
  conanDetector,
  cranDetector,
  cpanDetector,
  hackageDetector,
  juliaDetector,
  luarocksDetector,
  opamDetector,
  bazelDetector,
  // Tier 5
  zigDetector,
  jsrDetector,
  mojoDetector,
];

/**
 * All registered package readers.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const packageReaders: ReadonlyArray<PackageReader> = [
  // Tier 1
  npmReader,
  golangReader,
  pypiReader,
  // Tier 2
  cargoReader,
  gemReader,
  mavenReader,
  nugetReader,
  // Tier 3
  composerReader,
  swiftReader,
  hexReader,
  pubReader,
  dockerReader,
  cocoapodsReader,
  condaReader,
  // Tier 4
  conanReader,
  cranReader,
  huggingfaceReader,
  cpanReader,
  hackageReader,
  juliaReader,
  luarocksReader,
  opamReader,
  bazelReader,
  // Tier 5
  zigReader,
  denoReader,
  mojoReader,
];
