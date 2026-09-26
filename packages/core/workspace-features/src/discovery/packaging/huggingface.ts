/**
 * Hugging Face (ML models) package reader for package-compatibility discovery.
 *
 * Reads YAML frontmatter from model cards in the Hugging Face cache directory.
 * No detector is provided for this ecosystem.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Intentional escape hatch: node:os homedir() has no @effect/platform equivalent.
import * as os from "node:os";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import YAML from "yaml";
import { envOption } from "@agentxm/host-primitives";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { decodeAgentExtensions, readFileOptional } from "./reader-io.js";
import type { DetectedPackage, PackageReader } from "./types.js";

const huggingfaceType = Schema.decodeUnknownSync(PackageTypeSchema)("huggingface");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract YAML frontmatter from a markdown file.
 * Frontmatter is delimited by `---` at the start and end.
 */
const extractYamlFrontmatter = (content: string): string | undefined => {
  if (!content.startsWith("---")) return undefined;

  const endIdx = content.indexOf("\n---", 3);
  if (endIdx === -1) return undefined;

  return content.slice(3, endIdx).trim();
};

/** Schema for detecting the portable field in model card frontmatter. */
const ModelCardAgentExtensionsSchema = Schema.Struct({
  agentExtensions: Schema.optional(Schema.Unknown),
});
const decodeModelCardAgentExtensions = Schema.decodeUnknownResult(ModelCardAgentExtensionsSchema);

/**
 * Resolve the Hugging Face cache directory.
 * Checks HUGGINGFACE_HUB_CACHE, HF_HOME, then defaults to ~/.cache/huggingface/hub.
 */
const resolveHfCache = () =>
  Effect.gen(function* () {
    const hubCache = yield* envOption("HUGGINGFACE_HUB_CACHE");
    if (Option.isSome(hubCache)) return hubCache.value;
    const home = yield* envOption("HF_HOME");
    return Option.isSome(home) && home.value.length > 0
      ? `${home.value}/hub`
      : `${os.homedir()}/.cache/huggingface/hub`;
  });

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

/**
 * Hugging Face model reader.
 *
 * Reads YAML frontmatter from model cards in
 * `~/.cache/huggingface/hub/models--<id>/` and extracts agentExtensions metadata.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const huggingfaceReader: PackageReader = {
  type: huggingfaceType,
  read: Effect.fn("read.huggingface")(
    function* (pkg: DetectedPackage) {
      const path = yield* Path.Path;
      const hfCache = yield* resolveHfCache();

      // Model IDs use -- as separator in the cache directory
      // e.g., models--org--model-name for org/model-name
      const namespace = pkg.purl.namespace;
      const modelDirName = namespace
        ? `models--${namespace}--${pkg.purl.name}`
        : `models--${pkg.purl.name}`;

      // Look for README.md in the snapshot directory
      const modelDir = path.join(hfCache, modelDirName);

      // Find the latest snapshot by reading the refs/main file
      const refsMainPath = path.join(modelDir, "refs", "main");
      const refContent = yield* readFileOptional(refsMainPath);
      if (Option.isNone(refContent)) return Option.none();

      const snapshotHash = refContent.value.trim();
      if (snapshotHash === "") return Option.none();

      const readmePath = path.join(modelDir, "snapshots", snapshotHash, "README.md");
      const readmeContent = yield* readFileOptional(readmePath);
      if (Option.isNone(readmeContent)) return Option.none();

      // Extract YAML frontmatter
      const frontmatter = extractYamlFrontmatter(readmeContent.value);
      if (frontmatter === undefined) return Option.none();

      // Parse YAML frontmatter
      const parsed = yield* Effect.try({
        try: (): unknown => YAML.parse(frontmatter),
        catch: () => ({ _tag: "YamlParseError" as const }),
      }).pipe(Effect.option);

      if (Option.isNone(parsed)) {
        yield* Effect.logWarning(
          `Malformed YAML frontmatter in ${pkg.purl.name} model card, skipping`,
        );
        return Option.none();
      }

      // Extract agentExtensions metadata
      const containerResult = decodeModelCardAgentExtensions(parsed.value);
      if (Result.isFailure(containerResult)) return Option.none();

      if (containerResult.success.agentExtensions === undefined) return Option.none();

      const metaResult = yield* decodeAgentExtensions(parsed.value);
      if (Result.isFailure(metaResult)) {
        yield* Effect.logWarning(
          `Invalid agentExtensions metadata in ${pkg.purl.name}: schema validation failed`,
        );
        return Option.none();
      }

      return Option.some(metaResult.success.agentExtensions);
    },
    Effect.annotateLogs({ reader: "huggingface" }),
    Effect.withSpan("read.huggingface"),
  ),
};
