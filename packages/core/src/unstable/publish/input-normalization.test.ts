import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { exactVersion, extensionName, handle } from "../test-helpers.js";
import {
  defaultReadEntry,
  normalizePublishInput,
  type DeclaredPublishIdentity,
  type PublishArchiveInput,
} from "./input-normalization.js";
import { parseZipCentralDirectory } from "./archive-guardrails.js";
import { buildZip, textContent } from "./test-zip-helpers.js";

const makeDeclaredIdentity = (
  overrides?: Partial<DeclaredPublishIdentity>,
): DeclaredPublishIdentity => ({
  owner: handle("@acme"),
  type: "skill",
  name: extensionName("code-review"),
  version: exactVersion("1.0.0"),
  ...overrides,
});

const makeValidSkillZip = (manifestOverrides?: Record<string, unknown>) => {
  const manifest = {
    owner: "@acme",
    type: "skill",
    name: "code-review",
    version: "1.0.0",
    description: "A code review skill",
    ...manifestOverrides,
  };

  return buildZip([
    {
      fileName: "skill.json",
      content: textContent(JSON.stringify(manifest)),
    },
    {
      fileName: "src/SKILL.md",
      content: textContent(
        "---\nname: code-review\ndescription: Reviews code changes.\n---\n\n# Code review\n",
      ),
    },
    { fileName: "index.js", content: textContent("module.exports = {}") },
  ]);
};

const makeBody = (
  zip?: Uint8Array,
  overrides?: Partial<PublishArchiveInput>,
): PublishArchiveInput => ({
  archiveBytes: zip ?? makeValidSkillZip(),
  archiveContentType: "application/zip",
  ...overrides,
});

describe("normalizePublishInput", () => {
  it.effect("normalizes a valid skill publish input", () =>
    Effect.gen(function* () {
      const result = yield* normalizePublishInput({
        declaredIdentity: makeDeclaredIdentity(),
        archive: makeBody(),
      });

      expect(result.owner).toBe("@acme");
      expect(result.manifest.identity.owner).toBe("@acme");
    }),
  );

  it.effect("preserves optional integrity and digest headers", () =>
    Effect.gen(function* () {
      const result = yield* normalizePublishInput({
        declaredIdentity: makeDeclaredIdentity(),
        archive: makeBody(undefined, { clientIntegrity: "sha512-abc123" }),
        digestHeader: "sha-512=abc123==",
      });

      expect(result.clientIntegrity).toBe("sha512-abc123");
      expect(result.digestHeader).toBe("sha-512=abc123==");
    }),
  );

  it.effect("fails for unsupported content type", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        normalizePublishInput({
          declaredIdentity: makeDeclaredIdentity(),
          archive: makeBody(undefined, {
            archiveContentType: "application/x-tar",
          }),
        }),
      );

      expect(error._tag).toBe("IngestUnsupportedContentTypeError");
    }),
  );

  it.effect("fails when declared identity and manifest disagree", () =>
    Effect.gen(function* () {
      const zip = makeValidSkillZip({ name: "different-name" });
      const error = yield* Effect.flip(
        normalizePublishInput({
          declaredIdentity: makeDeclaredIdentity(),
          archive: makeBody(zip),
        }),
      );

      expect(error._tag).toBe("ManifestError");
      if (error._tag === "ManifestError") {
        expect(error.code).toBe("declared_manifest_mismatch");
      }
    }),
  );

  it.effect("normalizes pack publish input", () =>
    Effect.gen(function* () {
      const zip = buildZip([
        {
          fileName: "pack.json",
          content: textContent(
            JSON.stringify({
              owner: "@acme",
              type: "pack",
              name: "my-pack",
              version: "1.0.0",
              dependencies: { "@acme/skills/code-review": "^1.0.0" },
            }),
          ),
        },
      ]);

      const result = yield* normalizePublishInput({
        declaredIdentity: makeDeclaredIdentity({
          type: "pack",
          name: extensionName("my-pack"),
        }),
        archive: makeBody(zip),
      });

      expect(result.type).toBe("pack");
    }),
  );

  it.effect.each([
    {
      type: "skill" as const,
      manifest: { description: "Reviews code" },
      missing: "src/SKILL.md",
    },
    {
      type: "subagent" as const,
      manifest: { description: "Reviews code" },
      missing: "src/code-review.md",
    },
    {
      type: "rule" as const,
      manifest: { description: "Reviews code" },
      missing: "src/RULE.md",
    },
    {
      type: "hook" as const,
      manifest: {
        description: "Reviews code",
        runtime: "bash",
        entrypoint: "src/hook.sh",
        bindings: [{ on: "session.start" }],
      },
      missing: "src/hook.sh",
    },
    {
      type: "knowledge" as const,
      manifest: {
        description: "Reviews code",
        format: { name: "okf", version: "0.2" },
        bundleRoot: "src",
      },
      missing: "src/index.md",
    },
  ])("rejects a filtered $type archive missing $missing", ({ type, manifest, missing }) =>
    Effect.gen(function* () {
      const manifestFile = `${type}.json`;
      const zip = buildZip([
        {
          fileName: manifestFile,
          content: textContent(
            JSON.stringify({
              owner: "@acme",
              type,
              name: "code-review",
              version: "1.0.0",
              ...manifest,
            }),
          ),
        },
      ]);
      const error = yield* Effect.flip(
        normalizePublishInput({
          declaredIdentity: makeDeclaredIdentity({ type }),
          archive: makeBody(zip),
        }),
      );

      expect(error._tag).toBe("FilteredPackageError");
      if (error._tag === "FilteredPackageError") {
        expect(error.code).toBe("required_file_missing");
        expect(error.path).toBe(missing);
      }
    }),
  );
});

describe("defaultReadEntry", () => {
  it.effect("rejects a deflate entry that inflates beyond its declared size (zip bomb)", () =>
    Effect.gen(function* () {
      // 1 MiB of zeros deflates to a few bytes; the central directory declares a
      // tiny uncompressed size so guardrail checks pass, but the stream expands.
      const big = new Uint8Array(1024 * 1024);
      const zip = buildZip([{ fileName: "bomb.bin", content: big, compressionMethod: 8 }]);
      const entries = yield* parseZipCentralDirectory(zip);
      const first = entries[0];
      expect(first).toBeDefined();
      if (first === undefined) return;

      const lyingEntry = { ...first, uncompressedSize: 16 };
      const result = yield* defaultReadEntry(zip, lyingEntry).pipe(Effect.flip);

      expect(result._tag).toBe("ArchiveGuardrailError");
      expect(result.code).toBe("decompression_limit_exceeded");
    }),
  );

  it.effect("maps a corrupt deflate stream to a typed error, not an uncaught defect", () =>
    Effect.gen(function* () {
      // Stored bytes that are not a valid deflate stream, read as if deflated.
      const zip = buildZip([
        { fileName: "bad.bin", content: textContent("not a deflate stream"), compressionMethod: 0 },
      ]);
      const entries = yield* parseZipCentralDirectory(zip);
      const first = entries[0];
      expect(first).toBeDefined();
      if (first === undefined) return;

      const entry = { ...first, compressionMethod: 8 };
      const result = yield* defaultReadEntry(zip, entry).pipe(Effect.flip);

      expect(result._tag).toBe("ArchiveGuardrailError");
      expect(result.code).toBe("malformed_archive");
    }),
  );
});
