/**
 * Docker image detector and reader for package-compatibility discovery.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { PackageURL } from "packageurl-js";
import { AxmPackageMetaSchema } from "./axm-package-meta.js";
import { PackageTypeSchema } from "./package-type.js";
import { PackageUrlSchema } from "./package-url.js";
import type { DetectedPackage, PackageDetector, PackageReader } from "./types.js";

const dockerType = Schema.decodeUnknownSync(PackageTypeSchema)("docker");
const decodePurl = Schema.decodeUnknownSync(PackageUrlSchema);
const decodeAxmMeta = Schema.decodeUnknownResult(AxmPackageMetaSchema);

/**
 * Read a file as string, returning Option.none for NotFound and other errors.
 */
const readFileOptional = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const content = yield* fs.readFileString(filePath).pipe(Effect.option);
    return content;
  });

/**
 * Parse JSON string, returning Option.none and logging a warning on failure.
 */
const parseJsonOptional = (content: string, context: string) =>
  Effect.gen(function* () {
    const result = yield* Effect.try({
      try: (): unknown => JSON.parse(content),
      catch: () => ({ _tag: "JsonParseError" as const }),
    }).pipe(Effect.option);

    if (Option.isNone(result)) {
      yield* Effect.logWarning(`Malformed JSON in ${context}, skipping`);
      return Option.none<unknown>();
    }

    return Option.some(result.value);
  });

/**
 * Parse a Docker image reference into namespace, name, and version components.
 *
 * Image references can be:
 * - `name` (e.g. `nginx`)
 * - `name:tag` (e.g. `nginx:alpine`)
 * - `org/name:tag` (e.g. `library/nginx:1.25`)
 * - `registry/org/name:tag` (e.g. `ghcr.io/org/myapp:latest`)
 */
const parseImageRef = (
  ref: string,
):
  | {
      readonly namespace: string | undefined;
      readonly name: string;
      readonly version: string | undefined;
    }
  | undefined => {
  const trimmed = ref.trim();
  if (trimmed.length === 0) return undefined;

  // Split on : to get name part and tag part
  const colonIdx = trimmed.lastIndexOf(":");
  let namePart: string;
  let tag: string | undefined;

  if (colonIdx > 0 && !trimmed.slice(colonIdx).includes("/")) {
    namePart = trimmed.slice(0, colonIdx);
    tag = trimmed.slice(colonIdx + 1);
  } else {
    namePart = trimmed;
    tag = undefined;
  }

  // Remove @sha256 digest if present
  const digestIdx = namePart.indexOf("@");
  if (digestIdx > 0) {
    namePart = namePart.slice(0, digestIdx);
  }

  // Split namespace and name
  const lastSlash = namePart.lastIndexOf("/");
  let namespace: string | undefined;
  let name: string;

  if (lastSlash > 0) {
    namespace = namePart.slice(0, lastSlash);
    name = namePart.slice(lastSlash + 1);
  } else {
    namespace = undefined;
    name = namePart;
  }

  if (name.length === 0) return undefined;

  // `latest` tag or no tag → versionless
  const version = tag !== undefined && tag !== "latest" && tag.length > 0 ? tag : undefined;

  return { namespace, name, version };
};

/**
 * Convert a parsed image reference to a DetectedPackage.
 */
const imageToPurl = (ref: string, source: string): DetectedPackage | undefined => {
  const parsed = parseImageRef(ref);
  if (parsed === undefined) return undefined;

  const purl = new PackageURL(
    "docker",
    parsed.namespace ?? null,
    parsed.name,
    parsed.version ?? null,
    null,
    null,
  );
  const purlParts = decodePurl(purl.toString());

  return { purl: purlParts, type: dockerType, source };
};

/**
 * Parse ARG directives from Dockerfile content.
 * Returns a map of variable name to default value (or undefined if no default).
 */
const parseDockerArgs = (content: string): ReadonlyMap<string, string | undefined> => {
  const args = new Map<string, string | undefined>();
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.toUpperCase().startsWith("ARG ")) continue;

    const rest = trimmed.slice(4).trim();
    const eqIdx = rest.indexOf("=");
    if (eqIdx > 0) {
      const name = rest.slice(0, eqIdx).trim();
      const value = rest.slice(eqIdx + 1).trim();
      args.set(name, value);
    } else {
      args.set(rest, undefined);
    }
  }

  return args;
};

/**
 * Resolve a variable reference like `${VARIABLE}` using ARG defaults.
 * Returns the resolved string, or undefined if unresolvable.
 */
const resolveVariable = (
  imageRef: string,
  args: ReadonlyMap<string, string | undefined>,
): string | undefined => {
  // Check if the entire reference or parts contain variables
  const varPattern = /\$\{([^}]+)\}/g;
  let resolved = imageRef;
  let match = varPattern.exec(imageRef);

  while (match !== null) {
    const varName = match[1];
    if (varName === undefined) return undefined;

    // Check for ${VAR:-default} syntax
    const colonIdx = varName.indexOf(":-");
    const defaultValue = colonIdx > 0 ? varName.slice(colonIdx + 2) : args.get(varName);

    if (defaultValue === undefined) return undefined;
    resolved = resolved.replace(match[0], defaultValue);
    match = varPattern.exec(imageRef);
  }

  return resolved;
};

/**
 * Parse FROM directives from Dockerfile content.
 */
const parseDockerfile = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const args = parseDockerArgs(content);
  const lines = content.split("\n");
  const results: Array<DetectedPackage> = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.toUpperCase().startsWith("FROM ")) continue;

    const rest = trimmed.slice(5).trim();

    // Remove AS alias
    const parts = rest.split(/\s+/);
    let imageRef = parts[0];
    if (imageRef === undefined || imageRef.length === 0) continue;

    // Resolve variables
    if (imageRef.includes("${")) {
      const resolved = resolveVariable(imageRef, args);
      if (resolved === undefined) continue;
      imageRef = resolved;
    }

    // Skip scratch
    if (imageRef === "scratch") continue;

    const detected = imageToPurl(imageRef, source);
    if (detected !== undefined) results.push(detected);
  }

  return results;
};

/**
 * Parse docker-compose YAML using line-based parsing.
 * Extracts `image:` values from service definitions.
 */
const parseDockerCompose = (content: string, source: string): ReadonlyArray<DetectedPackage> => {
  const lines = content.split("\n");
  const results: Array<DetectedPackage> = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;

    // Match `image: value` lines
    if (trimmed.startsWith("image:")) {
      const value = trimmed.slice(6).trim();
      // Remove quotes if present
      const cleaned = value.replace(/^["']|["']$/g, "");
      if (cleaned.length > 0) {
        const detected = imageToPurl(cleaned, source);
        if (detected !== undefined) results.push(detected);
      }
    }
  }

  return results;
};

/**
 * Docker package detector.
 *
 * Scans `Dockerfile`, `docker-compose.yml`, and `docker-compose.yaml`
 * for image dependencies.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const dockerDetector: PackageDetector = {
  type: dockerType,
  detect: Effect.fn("detect.docker")(
    function* (projectDir: string) {
      const path = yield* Path.Path;
      const results: Array<DetectedPackage> = [];

      // Parse Dockerfile
      const dockerfilePath = path.join(projectDir, "Dockerfile");
      const dockerfileContent = yield* readFileOptional(dockerfilePath);
      if (Option.isSome(dockerfileContent)) {
        const deps = parseDockerfile(dockerfileContent.value, dockerfilePath);
        results.push(...deps);
      }

      // Parse docker-compose.yml
      const composeYmlPath = path.join(projectDir, "docker-compose.yml");
      const composeYmlContent = yield* readFileOptional(composeYmlPath);
      if (Option.isSome(composeYmlContent)) {
        const deps = parseDockerCompose(composeYmlContent.value, composeYmlPath);
        results.push(...deps);
      }

      // Parse docker-compose.yaml
      const composeYamlPath = path.join(projectDir, "docker-compose.yaml");
      const composeYamlContent = yield* readFileOptional(composeYamlPath);
      if (Option.isSome(composeYamlContent)) {
        const deps = parseDockerCompose(composeYamlContent.value, composeYamlPath);
        results.push(...deps);
      }

      return results;
    },
    Effect.annotateLogs({ detector: "docker" }),
    Effect.withSpan("detect.docker"),
  ),
};

/**
 * Docker package reader.
 *
 * Inspects local Docker image metadata for `sh.axm.recommended-extensions`
 * annotation. Since inspecting Docker images requires the Docker CLI,
 * this reader returns Option.none when Docker is not available.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const dockerReader: PackageReader = {
  type: dockerType,
  read: Effect.fn("read.docker")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;

      // Reconstruct the image name from purl parts
      const imageName = pkg.purl.namespace
        ? `${pkg.purl.namespace}/${pkg.purl.name}`
        : pkg.purl.name;
      const imageRef = pkg.purl.version ? `${imageName}:${pkg.purl.version}` : imageName;

      // Derive project directory from source
      const projectDir = path.dirname(pkg.source);

      // Check for a local .axm-docker-annotations/<image>.json file
      // This is a simplified approach that checks for sidecar annotation files
      const safeImageName = imageRef.replace(/[/:]/g, "_");
      const annotationPath = path.join(
        projectDir,
        ".axm-docker-annotations",
        `${safeImageName}.json`,
      );

      const content = yield* readFileOptional(annotationPath);
      if (Option.isNone(content)) return Option.none();

      const parsed = yield* parseJsonOptional(content.value, `docker annotations for ${imageRef}`);
      if (Option.isNone(parsed)) return Option.none();

      // Validate axm metadata structure
      const metaResult = decodeAxmMeta(parsed.value);
      if (Result.isFailure(metaResult)) {
        yield* Effect.logWarning(
          `Invalid axm metadata in docker image ${imageRef}: schema validation failed`,
        );
        return Option.none();
      }

      return Option.some(metaResult.success.extensions);
    },
    Effect.annotateLogs({ reader: "docker" }),
    Effect.withSpan("read.docker"),
  ),
};
