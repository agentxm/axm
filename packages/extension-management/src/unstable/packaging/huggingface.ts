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
import { readEnv } from "../utils/index.js";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { decodeAxmMeta, readFileOptional } from "./reader-io.js";
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

/** Schema for extracting the axm field from model card frontmatter. */
const ModelCardAxmSchema = Schema.Struct({
  axm: Schema.optional(Schema.Unknown),
});
const decodeModelCardAxm = Schema.decodeUnknownResult(ModelCardAxmSchema);

/**
 * Resolve the Hugging Face cache directory.
 * Checks HF_HOME, HUGGINGFACE_HUB_CACHE, then defaults to ~/.cache/huggingface/hub.
 */
const resolveHfCache = () =>
  Effect.sync(
    () =>
      readEnv("HUGGINGFACE_HUB_CACHE") ??
      (readEnv("HF_HOME") ? `${readEnv("HF_HOME")}/hub` : `${os.homedir()}/.cache/huggingface/hub`),
  );

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

/**
 * Hugging Face model reader.
 *
 * Reads YAML frontmatter from model cards in
 * `~/.cache/huggingface/hub/models--<id>/` and extracts axm metadata.
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

      // Extract axm metadata
      const containerResult = decodeModelCardAxm(parsed.value);
      if (Result.isFailure(containerResult)) return Option.none();

      const axmRaw = containerResult.success.axm;
      if (axmRaw === undefined) return Option.none();

      const metaResult = decodeAxmMeta(axmRaw);
      if (Result.isFailure(metaResult)) {
        yield* Effect.logWarning(
          `Invalid axm metadata in ${pkg.purl.name}: schema validation failed`,
        );
        return Option.none();
      }

      return Option.some(metaResult.success.extensions);
    },
    Effect.annotateLogs({ reader: "huggingface" }),
    Effect.withSpan("read.huggingface"),
  ),
};
