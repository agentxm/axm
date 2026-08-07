/**
 * Maven/Gradle package detector and reader for package-compatibility discovery.
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
import { parseTomlStringEntries, readTomlSection } from "../toml/index.js";
import { makeDetectedPackage } from "./detected-package.js";
import { PackageTypeSchema } from "./package-type.js";
import { decodeAxmMeta, parseJsonOptional, readFileOptional } from "./reader-io.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const mavenType = Schema.decodeUnknownSync(PackageTypeSchema)("maven");

/**
 * Returns true if the version string is a Maven version range.
 * Ranges use brackets/parens like [1.0,2.0), (,1.0], etc.
 */
const isMavenVersionRange = (version: string): boolean =>
  /^[[(]/.test(version) || /[)\]]$/.test(version);

/**
 * Returns true if the version string is a property reference like ${foo.bar}.
 */
const isPropertyReference = (version: string): boolean => /^\$\{.+\}$/.test(version);

/**
 * Extract the property name from a property reference like ${foo.bar} -> foo.bar.
 */
const extractPropertyName = (version: string): string | undefined => {
  const match = /^\$\{(.+)\}$/.exec(version);
  return match?.[1];
};

/**
 * Parse <properties> from pom.xml content. Returns a map of property name to value.
 */
const parseProperties = (content: string): ReadonlyMap<string, string> => {
  const props = new Map<string, string>();
  const propsBlockMatch = /<properties>([\s\S]*?)<\/properties>/i.exec(content);
  if (propsBlockMatch?.[1] === undefined) return props;

  const propRegex = /<([a-zA-Z0-9_.:-]+)>\s*(.*?)\s*<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = propRegex.exec(propsBlockMatch[1])) !== null) {
    if (match[1] !== undefined && match[2] !== undefined) {
      props.set(match[1], match[2]);
    }
  }
  return props;
};

/**
 * Resolve a version string, handling property references.
 */
const resolveVersion = (
  version: string | undefined,
  properties: ReadonlyMap<string, string>,
): string | undefined => {
  if (version === undefined) return undefined;
  if (isMavenVersionRange(version)) return undefined;

  if (isPropertyReference(version)) {
    const propName = extractPropertyName(version);
    if (propName === undefined) return undefined;
    const resolved = properties.get(propName);
    if (resolved === undefined) return undefined;
    // Recursively resolve in case the property itself references another
    return resolveVersion(resolved, properties);
  }

  return version;
};

/**
 * Create a DetectedPackage from groupId, artifactId, and optional version.
 */
const makeMavenPackage = (
  groupId: string,
  artifactId: string,
  version: string | undefined,
  source: string,
): DetectedPackage | undefined =>
  Option.getOrUndefined(
    makeDetectedPackage({
      type: mavenType,
      ...(groupId === "" ? {} : { namespace: groupId }),
      name: artifactId,
      ...(version === undefined ? {} : { version }),
      source,
    }),
  );

const appendMavenPackage = (
  results: Array<DetectedPackage>,
  groupId: string,
  artifactId: string,
  version: string | undefined,
  source: string,
): void => {
  const detected = makeMavenPackage(groupId, artifactId, version, source);
  if (detected !== undefined) results.push(detected);
};

/**
 * Parse pom.xml content and extract dependencies.
 */
const parsePomXml = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const properties = parseProperties(content);
  const results: Array<DetectedPackage> = [];

  // Match <dependency> blocks
  const depRegex = /<dependency>([\s\S]*?)<\/dependency>/gi;
  let depMatch: RegExpExecArray | null;
  while ((depMatch = depRegex.exec(content)) !== null) {
    const block = depMatch[1];
    if (block === undefined) continue;

    const groupIdMatch = /<groupId>\s*(.*?)\s*<\/groupId>/i.exec(block);
    const artifactIdMatch = /<artifactId>\s*(.*?)\s*<\/artifactId>/i.exec(block);
    const versionMatch = /<version>\s*(.*?)\s*<\/version>/i.exec(block);

    const groupId = groupIdMatch?.[1];
    const artifactId = artifactIdMatch?.[1];
    if (groupId === undefined || artifactId === undefined) continue;

    const rawVersion = versionMatch?.[1];
    const version = resolveVersion(rawVersion, properties);

    appendMavenPackage(results, groupId, artifactId, version, source);
  }

  return results;
};

/** Gradle configuration keywords that declare dependencies. */
const GRADLE_CONFIGS = [
  "implementation",
  "api",
  "compileOnly",
  "runtimeOnly",
  "testImplementation",
  "testCompileOnly",
  "testRuntimeOnly",
  "annotationProcessor",
  "kapt",
] as const;

/**
 * Parse a Gradle dependency string like "group:name:version" or "group:name".
 */
const parseGradleCoordinate = (coordinate: string, source: string): DetectedPackage | undefined => {
  const parts = coordinate.split(":");
  if (parts.length < 2) return undefined;

  const groupId = parts[0];
  const artifactId = parts[1];
  if (groupId === undefined || artifactId === undefined) return undefined;
  if (groupId.trim() === "" || artifactId.trim() === "") return undefined;

  const version =
    parts.length >= 3 && parts[2] !== undefined && parts[2].trim() !== ""
      ? parts[2].trim()
      : undefined;

  return makeMavenPackage(groupId.trim(), artifactId.trim(), version, source);
};

/**
 * Parse build.gradle or build.gradle.kts content and extract dependencies.
 */
const parseGradleBuild = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const results: Array<DetectedPackage> = [];
  const configPattern = GRADLE_CONFIGS.join("|");

  // Groovy DSL: implementation 'group:name:version'
  const groovyRegex = new RegExp(`(?:${configPattern})\\s+['"]([^'"]+)['"]`, "g");
  let match: RegExpExecArray | null;
  while ((match = groovyRegex.exec(content)) !== null) {
    if (match[1] === undefined) continue;
    const detected = parseGradleCoordinate(match[1], source);
    if (detected !== undefined) results.push(detected);
  }

  // Kotlin DSL: implementation("group:name:version")
  const kotlinRegex = new RegExp(`(?:${configPattern})\\(\\s*['"]([^'"]+)['"]\\s*\\)`, "g");
  while ((match = kotlinRegex.exec(content)) !== null) {
    if (match[1] === undefined) continue;
    const detected = parseGradleCoordinate(match[1], source);
    if (detected !== undefined) results.push(detected);
  }

  return results;
};

/**
 * Parse gradle/libs.versions.toml content and extract library entries.
 * Supports `module = "group:name"` and separate `group`/`name` keys.
 */
const parseVersionCatalog = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const results: Array<DetectedPackage> = [];

  const librariesSection = readTomlSection(content, "libraries");
  if (librariesSection === undefined) return results;

  // Parse [versions] section for version references
  const versions = new Map<string, string>();
  const versionsSection = readTomlSection(content, "versions");
  if (versionsSection !== undefined) {
    for (const { key, value } of parseTomlStringEntries(versionsSection)) {
      versions.set(key, value);
    }
  }

  // Parse library entries line by line
  const lines = librariesSection.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    // Match: name = { ... }
    const entryMatch = /^[a-zA-Z0-9_-]+\s*=\s*\{(.+)\}/.exec(trimmed);
    if (entryMatch?.[1] === undefined) continue;

    const props = entryMatch[1];

    let groupId: string | undefined;
    let artifactId: string | undefined;
    let version: string | undefined;

    // Check for module = "group:name"
    const moduleMatch = /module\s*=\s*"([^"]+)"/.exec(props);
    if (moduleMatch?.[1] !== undefined) {
      const parts = moduleMatch[1].split(":");
      groupId = parts[0];
      artifactId = parts[1];
    } else {
      // Check for separate group and name keys
      const groupMatch = /group\s*=\s*"([^"]+)"/.exec(props);
      const nameMatch = /name\s*=\s*"([^"]+)"/.exec(props);
      groupId = groupMatch?.[1];
      artifactId = nameMatch?.[1];
    }

    if (groupId === undefined || artifactId === undefined) continue;

    // Check for version
    const versionMatch = /version\s*=\s*"([^"]+)"/.exec(props);
    const versionRefMatch = /version\.ref\s*=\s*"([^"]+)"/.exec(props);

    if (versionMatch?.[1] !== undefined) {
      version = versionMatch[1];
    } else if (versionRefMatch?.[1] !== undefined) {
      version = versions.get(versionRefMatch[1]);
    }

    appendMavenPackage(results, groupId, artifactId, version, source);
  }

  return results;
};

/**
 * Parse deps.edn content and extract Maven dependencies.
 *
 * Supports dependencies declared in root `:deps` and alias `:extra-deps` maps.
 */
const parseDepsEdn = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const results: Array<DetectedPackage> = [];
  const withoutComments = content.replace(/;[^\n\r]*/g, "");
  const depRegex =
    /(^|[\s{])([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?)\s*\{[^}]*:mvn\/version\s+"([^"]+)"[^}]*}/g;

  let match: RegExpExecArray | null;
  while ((match = depRegex.exec(withoutComments)) !== null) {
    const coordinate = match[2];
    const version = match[3];
    if (coordinate === undefined || version === undefined) continue;

    const parts = coordinate.split("/");
    if (parts.length === 1) {
      const artifactId = parts[0];
      if (artifactId !== undefined && artifactId.trim() !== "") {
        appendMavenPackage(results, "", artifactId.trim(), version, source);
      }
      continue;
    }

    if (parts.length === 2) {
      const groupId = parts[0];
      const artifactId = parts[1];
      if (
        groupId !== undefined &&
        artifactId !== undefined &&
        groupId.trim() !== "" &&
        artifactId.trim() !== ""
      ) {
        appendMavenPackage(results, groupId.trim(), artifactId.trim(), version, source);
      }
    }
  }

  return results;
};

/**
 * Deduplicate packages by purl identity (namespace + name).
 */
const deduplicatePackages = (
  packages: ReadonlyArray<DetectedPackage>,
): ReadonlyArray<DetectedPackage> => {
  const seen = new Set<string>();
  const results: Array<DetectedPackage> = [];

  for (const pkg of packages) {
    const key = `${pkg.purl.namespace ?? ""}/${pkg.purl.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push(pkg);
    }
  }

  return results;
};

/**
 * List files matching a glob pattern in a directory.
 */
const listDirectory = (dirPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const entries = yield* fs.readDirectory(dirPath).pipe(Effect.option);
    return entries;
  });

/**
 * Find JAR files in a directory.
 */
const findJarsInDir = (dirPath: string) =>
  Effect.gen(function* () {
    const entries = yield* listDirectory(dirPath);
    if (Option.isNone(entries)) return [];
    return entries.value.filter((e) => e.endsWith(".jar"));
  });

/**
 * Read a ZIP file entry using the built-in Bun/Node zip APIs.
 * Returns Option.none if the entry is not found.
 */
const readZipEntry = (zipPath: string, entryName: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;

    // Read the jar file as bytes
    const bytes = yield* fs.readFile(zipPath).pipe(Effect.option);
    if (Option.isNone(bytes)) return Option.none<string>();

    // Use simple ZIP parsing to find the entry
    // ZIP files have a central directory at the end
    const data = bytes.value;
    const content = yield* Effect.try({
      try: () => {
        // Search for the local file header matching our entry name
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

        // Scan for local file headers (PK\x03\x04)
        for (let i = 0; i < data.length - 30; i++) {
          if (
            data[i] === 0x50 &&
            data[i + 1] === 0x4b &&
            data[i + 2] === 0x03 &&
            data[i + 3] === 0x04
          ) {
            const nameLength = view.getUint16(i + 26, true);
            const extraLength = view.getUint16(i + 28, true);
            const compressedSize = view.getUint32(i + 18, true);
            const compressionMethod = view.getUint16(i + 8, true);

            // Check if filename matches
            const fileNameStart = i + 30;
            const fileName = new TextDecoder().decode(
              data.slice(fileNameStart, fileNameStart + nameLength),
            );

            if (fileName === entryName) {
              // Only handle STORED (0) entries for simplicity
              if (compressionMethod !== 0) {
                return undefined;
              }
              const dataStart = fileNameStart + nameLength + extraLength;
              const entryData = data.slice(dataStart, dataStart + compressedSize);
              return new TextDecoder().decode(entryData);
            }
          }
        }
        return undefined;
      },
      catch: () => ({ _tag: "ZipReadError" as const }),
    }).pipe(Effect.option);

    if (Option.isNone(content) || content.value === undefined) {
      return Option.none<string>();
    }

    return Option.some(content.value);
  });

/**
 * Maven package detector.
 *
 * Scans `pom.xml`, `build.gradle`, `build.gradle.kts`, and
 * `gradle/libs.versions.toml` in the project directory. Also detects Clojure
 * `deps.edn` Maven coordinates declared with `:mvn/version`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const mavenDetector: PackageDetector = {
  type: mavenType,
  detect: Effect.fn("detect.maven")(
    function* (projectDir: string) {
      const path = yield* Path.Path;
      const allPackages: Array<DetectedPackage> = [];

      // Parse pom.xml
      const pomPath = path.join(projectDir, "pom.xml");
      const pomContent = yield* readFileOptional(pomPath);
      if (Option.isSome(pomContent)) {
        // Basic validation: check for XML-like content
        if (pomContent.value.includes("<") && pomContent.value.includes(">")) {
          const pomDeps = parsePomXml(pomContent.value, pomPath);
          allPackages.push(...pomDeps);
        } else {
          yield* Effect.logWarning("Malformed pom.xml: not valid XML, skipping");
        }
      }

      // Parse build.gradle
      const gradlePath = path.join(projectDir, "build.gradle");
      const gradleContent = yield* readFileOptional(gradlePath);
      if (Option.isSome(gradleContent)) {
        const gradleDeps = parseGradleBuild(gradleContent.value, gradlePath);
        allPackages.push(...gradleDeps);
      }

      // Parse build.gradle.kts
      const gradleKtsPath = path.join(projectDir, "build.gradle.kts");
      const gradleKtsContent = yield* readFileOptional(gradleKtsPath);
      if (Option.isSome(gradleKtsContent)) {
        const gradleKtsDeps = parseGradleBuild(gradleKtsContent.value, gradleKtsPath);
        allPackages.push(...gradleKtsDeps);
      }

      // Parse gradle/libs.versions.toml
      const versionCatalogPath = path.join(projectDir, "gradle", "libs.versions.toml");
      const catalogContent = yield* readFileOptional(versionCatalogPath);
      if (Option.isSome(catalogContent)) {
        const catalogDeps = parseVersionCatalog(catalogContent.value, versionCatalogPath);
        allPackages.push(...catalogDeps);
      }

      // Parse deps.edn
      const depsEdnPath = path.join(projectDir, "deps.edn");
      const depsEdnContent = yield* readFileOptional(depsEdnPath);
      if (Option.isSome(depsEdnContent)) {
        const depsEdnDeps = parseDepsEdn(depsEdnContent.value, depsEdnPath);
        allPackages.push(...depsEdnDeps);
      }

      return deduplicatePackages(allPackages);
    },
    Effect.annotateLogs({ detector: "maven" }),
    Effect.withSpan("detect.maven"),
  ),
};

/**
 * Maven package reader.
 *
 * Reads `META-INF/axm.json` from local JAR files in `~/.m2/repository/`
 * or Gradle cache `~/.gradle/caches/modules-2/files-2.1/`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const mavenReader: PackageReader = {
  type: mavenType,
  read: Effect.fn("read.maven")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;
      const home = os.homedir();

      const groupId = pkg.purl.namespace ?? "";
      const artifactId = pkg.purl.name;
      const version = pkg.purl.version ?? "0.0.0";

      // Convert groupId dots to path separators for Maven repo
      const groupIdPath = groupId.replace(/\./g, "/");

      // Try Maven local repository first
      const m2Dir = path.join(home, ".m2", "repository", groupIdPath, artifactId, version);

      const m2Jars = yield* findJarsInDir(m2Dir);
      for (const jarName of m2Jars) {
        const jarPath = path.join(m2Dir, jarName);
        const axmContent = yield* readZipEntry(jarPath, "META-INF/axm.json");
        if (Option.isSome(axmContent)) {
          const parsed = yield* parseJsonOptional(
            axmContent.value,
            `${groupId}:${artifactId}@${version}/META-INF/axm.json`,
          );
          if (Option.isSome(parsed)) {
            const metaResult = decodeAxmMeta(parsed.value);
            if (Result.isFailure(metaResult)) {
              yield* Effect.logWarning(
                `Invalid axm metadata in ${groupId}:${artifactId}@${version}: schema validation failed`,
              );
              return Option.none();
            }
            return Option.some(metaResult.success.extensions);
          }
        }
      }

      // Try Gradle cache
      const gradleCacheDir = path.join(
        home,
        ".gradle",
        "caches",
        "modules-2",
        "files-2.1",
        groupId,
        artifactId,
        version,
      );

      // Gradle cache has hash subdirectories
      const gradleHashDirs = yield* listDirectory(gradleCacheDir);
      if (Option.isSome(gradleHashDirs)) {
        for (const hashDir of gradleHashDirs.value) {
          const hashDirPath = path.join(gradleCacheDir, hashDir);
          const jars = yield* findJarsInDir(hashDirPath);
          for (const jarName of jars) {
            const jarPath = path.join(hashDirPath, jarName);
            const axmContent = yield* readZipEntry(jarPath, "META-INF/axm.json");
            if (Option.isSome(axmContent)) {
              const parsed = yield* parseJsonOptional(
                axmContent.value,
                `${groupId}:${artifactId}@${version}/META-INF/axm.json`,
              );
              if (Option.isSome(parsed)) {
                const metaResult = decodeAxmMeta(parsed.value);
                if (Result.isFailure(metaResult)) {
                  yield* Effect.logWarning(
                    `Invalid axm metadata in ${groupId}:${artifactId}@${version}: schema validation failed`,
                  );
                  return Option.none();
                }
                return Option.some(metaResult.success.extensions);
              }
            }
          }
        }
      }

      return Option.none();
    },
    Effect.annotateLogs({ reader: "maven" }),
    Effect.withSpan("read.maven"),
  ),
};
