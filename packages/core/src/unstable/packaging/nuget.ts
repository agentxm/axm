/**
 * NuGet package detector and reader for package-compatibility discovery.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Intentional escape hatch: node:os homedir() has no @effect/platform equivalent.
import * as os from "node:os";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { PackageURL } from "packageurl-js";
import { envWithDefault } from "../utils/environment.js";
import { PackageTypeSchema } from "./package-type.js";
import { decodePurl, decodeAxmMeta, readFileOptional, parseJsonOptional } from "./reader-io.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const nugetType = Schema.decodeUnknownSync(PackageTypeSchema)("nuget");

/**
 * Returns true if the version string is a NuGet version range.
 * Ranges use brackets/parens like [1.0,2.0), (,1.0], etc.
 */
const isNugetVersionRange = (version: string): boolean =>
  /^[[(]/.test(version) || /[)\]]$/.test(version);

/**
 * Returns true if the version string is a floating version (e.g., "1.0.*").
 */
const isFloatingVersion = (version: string): boolean => version.includes("*");

/**
 * Returns true if the version is an exact version (not a range or floating).
 */
const isExactVersion = (version: string): boolean =>
  !isNugetVersionRange(version) && !isFloatingVersion(version) && version.trim() !== "";

/**
 * Create a DetectedPackage from a NuGet package name and optional version.
 * Names are lowercased per NuGet case-insensitivity.
 */
const makeNugetPackage = (
  name: string,
  version: string | undefined,
  source: string,
): DetectedPackage => {
  const loweredName = name.toLowerCase();
  const resolvedVersion = version !== undefined && isExactVersion(version) ? version : undefined;

  const purl = new PackageURL("nuget", null, loweredName, resolvedVersion ?? null, null, null);
  const purlParts = decodePurl(purl.toString());
  return { purl: purlParts, type: nugetType, source };
};

/**
 * Extract an XML attribute value from a tag string.
 */
const extractAttribute = (tag: string, attrName: string): string | undefined => {
  const regex = new RegExp(`${attrName}\\s*=\\s*"([^"]*)"`, "i");
  const match = regex.exec(tag);
  return match?.[1];
};

/**
 * Parse .csproj/.fsproj/.vbproj content and extract PackageReference elements.
 */
const parseProjectFile = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const results: Array<DetectedPackage> = [];

  // Match self-closing PackageReference tags
  const selfClosingRegex = /<PackageReference\s+[^>]*\/>/gi;
  let match: RegExpExecArray | null;
  while ((match = selfClosingRegex.exec(content)) !== null) {
    const tag = match[0];
    const name = extractAttribute(tag, "Include");
    if (name === undefined) continue;
    const version = extractAttribute(tag, "Version");
    results.push(makeNugetPackage(name, version, source));
  }

  // Match PackageReference with child elements (e.g. <Version> child)
  const blockRegex = /<PackageReference\s+([^>]*)>([\s\S]*?)<\/PackageReference>/gi;
  while ((match = blockRegex.exec(content)) !== null) {
    const attrs = match[1];
    const body = match[2];
    if (attrs === undefined) continue;
    const name = extractAttribute(attrs, "Include");
    if (name === undefined) continue;
    // Try attribute first, then child element
    let version = extractAttribute(attrs, "Version");
    if (version === undefined && body !== undefined) {
      const versionMatch = /<Version>\s*(.*?)\s*<\/Version>/i.exec(body);
      version = versionMatch?.[1];
    }
    results.push(makeNugetPackage(name, version, source));
  }

  return results;
};

/**
 * Parse Directory.Packages.props content and extract PackageVersion elements.
 */
const parseDirectoryPackagesProps = (
  content: string,
  source: string,
): ReadonlyArray<DetectedPackage> => {
  const results: Array<DetectedPackage> = [];

  const pkgVersionRegex = /<PackageVersion\s+[^>]*\/>/gi;
  let match: RegExpExecArray | null;
  while ((match = pkgVersionRegex.exec(content)) !== null) {
    const tag = match[0];
    const name = extractAttribute(tag, "Include");
    if (name === undefined) continue;
    const version = extractAttribute(tag, "Version");
    results.push(makeNugetPackage(name, version, source));
  }

  return results;
};

/**
 * Parse packages.config content and extract package elements.
 */
const parsePackagesConfig = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const results: Array<DetectedPackage> = [];

  const pkgRegex = /<package\s+[^>]*\/>/gi;
  let match: RegExpExecArray | null;
  while ((match = pkgRegex.exec(content)) !== null) {
    const tag = match[0];
    const name = extractAttribute(tag, "id");
    if (name === undefined) continue;
    const version = extractAttribute(tag, "version");
    results.push(makeNugetPackage(name, version, source));
  }

  return results;
};

/**
 * Deduplicate packages by lowercased name.
 */
const deduplicatePackages = (
  packages: ReadonlyArray<DetectedPackage>,
): ReadonlyArray<DetectedPackage> => {
  const seen = new Set<string>();
  const results: Array<DetectedPackage> = [];

  for (const pkg of packages) {
    const key = pkg.purl.name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      results.push(pkg);
    }
  }

  return results;
};

/**
 * NuGet package detector.
 *
 * Scans `.csproj`, `.fsproj`, `.vbproj`, `Directory.Packages.props`,
 * and `packages.config` files in the project directory.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const nugetDetector: PackageDetector = {
  type: nugetType,
  detect: Effect.fn("detect.nuget")(
    function* (projectDir: string) {
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;
      const allPackages: Array<DetectedPackage> = [];

      // Find and parse project files (*.csproj, *.fsproj, *.vbproj)
      const entries = yield* fs.readDirectory(projectDir).pipe(Effect.option);
      if (Option.isSome(entries)) {
        const projectFiles = entries.value.filter(
          (e) => e.endsWith(".csproj") || e.endsWith(".fsproj") || e.endsWith(".vbproj"),
        );

        for (const file of projectFiles) {
          const filePath = path.join(projectDir, file);
          const content = yield* readFileOptional(filePath);
          if (Option.isSome(content)) {
            if (content.value.includes("<")) {
              const deps = parseProjectFile(content.value, filePath);
              allPackages.push(...deps);
            } else {
              yield* Effect.logWarning(`Malformed ${file}: not valid XML, skipping`);
            }
          }
        }
      }

      // Parse Directory.Packages.props
      const propsPath = path.join(projectDir, "Directory.Packages.props");
      const propsContent = yield* readFileOptional(propsPath);
      if (Option.isSome(propsContent)) {
        if (propsContent.value.includes("<")) {
          const propsDeps = parseDirectoryPackagesProps(propsContent.value, propsPath);
          allPackages.push(...propsDeps);
        } else {
          yield* Effect.logWarning("Malformed Directory.Packages.props: not valid XML, skipping");
        }
      }

      // Parse packages.config
      const packagesConfigPath = path.join(projectDir, "packages.config");
      const packagesConfigContent = yield* readFileOptional(packagesConfigPath);
      if (Option.isSome(packagesConfigContent)) {
        if (packagesConfigContent.value.includes("<")) {
          const configDeps = parsePackagesConfig(packagesConfigContent.value, packagesConfigPath);
          allPackages.push(...configDeps);
        } else {
          yield* Effect.logWarning("Malformed packages.config: not valid XML, skipping");
        }
      }

      return deduplicatePackages(allPackages);
    },
    Effect.annotateLogs({ detector: "nuget" }),
    Effect.withSpan("detect.nuget"),
  ),
};

/**
 * Resolve the NuGet packages folder path.
 */
const resolveNugetPackagesFolder = () =>
  envWithDefault("NUGET_PACKAGES", `${os.homedir()}/.nuget/packages`);

/**
 * NuGet package reader.
 *
 * Reads `axm.json` from `~/.nuget/packages/{id}/{version}/` for each
 * detected NuGet package and extracts recommendation metadata.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const nugetReader: PackageReader = {
  type: nugetType,
  read: Effect.fn("read.nuget")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;

      const packagesFolder = yield* resolveNugetPackagesFolder();

      // NuGet uses lowercased package IDs in directory names
      const pkgId = pkg.purl.name.toLowerCase();
      const version = pkg.purl.version ?? "0.0.0";

      const axmJsonPath = path.join(packagesFolder, pkgId, version, "axm.json");

      const content = yield* readFileOptional(axmJsonPath);
      if (Option.isNone(content)) return Option.none();

      const parsed = yield* parseJsonOptional(content.value, `${pkgId}@${version}/axm.json`);
      if (Option.isNone(parsed)) return Option.none();

      // Validate axm metadata structure
      const metaResult = decodeAxmMeta(parsed.value);
      if (Result.isFailure(metaResult)) {
        yield* Effect.logWarning(
          `Invalid axm metadata in ${pkgId}@${version}: schema validation failed`,
        );
        return Option.none();
      }

      return Option.some(metaResult.success.extensions);
    },
    Effect.annotateLogs({ reader: "nuget" }),
    Effect.withSpan("read.nuget"),
  ),
};
