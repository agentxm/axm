import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { PackageTypeSchema } from "@agentxm/extension-model/unstable/packaging/package-type";
import { PackageUrlPartsSchema } from "@agentxm/extension-model/unstable/packaging/package-url";
import { huggingfaceReader } from "./huggingface.js";

const huggingfaceType = Schema.decodeUnknownSync(PackageTypeSchema)("huggingface");
const makePurl = Schema.decodeUnknownSync(PackageUrlPartsSchema);

const withNodeContext = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

/** Helper to set up a temp HF cache for reader tests. */
const readInTempCache = (
  pkgPurl: Schema.Schema.Type<typeof PackageUrlPartsSchema>,
  readmeContent?: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const tmpDir = yield* fs.makeTempDirectoryScoped();

    const hfCache = path.join(tmpDir, "hf-cache");
    const snapshotHash = "abc123def456";

    if (readmeContent !== undefined) {
      // Build the cache directory structure
      const namespace = pkgPurl.namespace;
      const modelDirName = namespace
        ? `models--${namespace}--${pkgPurl.name}`
        : `models--${pkgPurl.name}`;
      const modelDir = path.join(hfCache, modelDirName);

      // Write refs/main
      const refsDir = path.join(modelDir, "refs");
      yield* fs.makeDirectory(refsDir, { recursive: true });
      yield* fs.writeFileString(path.join(refsDir, "main"), snapshotHash);

      // Write snapshot README.md
      const snapshotDir = path.join(modelDir, "snapshots", snapshotHash);
      yield* fs.makeDirectory(snapshotDir, { recursive: true });
      yield* fs.writeFileString(path.join(snapshotDir, "README.md"), readmeContent);
    }

    const detected = {
      purl: pkgPurl,
      type: huggingfaceType,
      source: "huggingface-cache",
    };

    const origCache = process.env["HUGGINGFACE_HUB_CACHE"];
    process.env["HUGGINGFACE_HUB_CACHE"] = hfCache;
    return yield* huggingfaceReader.read(detected).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (origCache === undefined) {
            delete process.env["HUGGINGFACE_HUB_CACHE"];
          } else {
            process.env["HUGGINGFACE_HUB_CACHE"] = origCache;
          }
        }),
      ),
    );
  }).pipe(Effect.scoped);

describe("huggingfaceReader", () => {
  it("has type huggingface", () => {
    expect(huggingfaceReader.type).toBe(huggingfaceType);
  });

  describe("valid axm metadata in YAML frontmatter", () => {
    it.effect("extracts extensions from frontmatter axm field", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "huggingface",
            namespace: "meta-llama",
            name: "Llama-2-7b",
          });
          const readme = [
            "---",
            "license: llama2",
            "axm:",
            "  extensions:",
            '    - { ref: "@meta/skills/llama", versionRange: "^1.0.0" }',
            "---",
            "# Llama 2",
            "This is a model card.",
          ].join("\n");
          const result = yield* readInTempCache(purl, readme);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([{ ref: "@meta/skills/llama", versionRange: "^1.0.0" }]);
          }
        }),
      ),
    );
  });

  describe("model without namespace", () => {
    it.effect("handles models without org namespace", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({ type: "huggingface", name: "gpt2" });
          const readme = [
            "---",
            "axm:",
            "  extensions:",
            '    - { ref: "@openai/skills/gpt2", versionRange: "^1.0.0" }',
            "---",
            "# GPT-2",
          ].join("\n");
          const result = yield* readInTempCache(purl, readme);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([{ ref: "@openai/skills/gpt2", versionRange: "^1.0.0" }]);
          }
        }),
      ),
    );
  });

  describe("missing cache", () => {
    it.effect("returns Option.none when cache does not exist", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "huggingface",
            namespace: "meta-llama",
            name: "Llama-2-7b",
          });
          const result = yield* readInTempCache(purl);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("no YAML frontmatter", () => {
    it.effect("returns Option.none when README has no frontmatter", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "huggingface",
            namespace: "meta-llama",
            name: "Llama-2-7b",
          });
          const readme = "# Llama 2\nThis is a model card without frontmatter.";
          const result = yield* readInTempCache(purl, readme);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("no axm field in frontmatter", () => {
    it.effect("returns Option.none when frontmatter has no axm field", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "huggingface",
            namespace: "meta-llama",
            name: "Llama-2-7b",
          });
          const readme = ["---", "license: llama2", "language: en", "---", "# Llama 2"].join("\n");
          const result = yield* readInTempCache(purl, readme);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("malformed YAML frontmatter", () => {
    it.effect("returns Option.none on malformed YAML", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "huggingface",
            namespace: "meta-llama",
            name: "Llama-2-7b",
          });
          const readme = ["---", "{{{{ not valid yaml", "---", "# Llama 2"].join("\n");
          const result = yield* readInTempCache(purl, readme);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("invalid axm metadata structure", () => {
    it.effect("returns Option.none when axm field has invalid structure", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "huggingface",
            namespace: "meta-llama",
            name: "Llama-2-7b",
          });
          const readme = ["---", "axm:", "  extensions: not-an-array", "---", "# Llama 2"].join(
            "\n",
          );
          const result = yield* readInTempCache(purl, readme);
          expect(Option.isNone(result)).toBe(true);
        }),
      ),
    );
  });

  describe("empty extensions", () => {
    it.effect("returns empty array from empty extensions", () =>
      withNodeContext(
        Effect.gen(function* () {
          const purl = makePurl({
            type: "huggingface",
            namespace: "meta-llama",
            name: "Llama-2-7b",
          });
          const readme = ["---", "axm:", "  extensions: []", "---", "# Llama 2"].join("\n");
          const result = yield* readInTempCache(purl, readme);
          expect(Option.isSome(result)).toBe(true);
          if (Option.isSome(result)) {
            expect(result.value).toEqual([]);
          }
        }),
      ),
    );
  });
});
