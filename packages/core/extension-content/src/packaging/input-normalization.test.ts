import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Tracer from "effect/Tracer";
import { exactVersion, extensionName, handle } from "../test-helpers.js";
import {
  normalizePublishInput,
  type DeclaredPublishIdentity,
  type PublishArchiveInput,
  ArchiveGuardrailError,
  defaultReadEntry,
  parseZipCentralDirectory,
  validateArchive,
} from "../index.js";
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
  content: zip ?? makeValidSkillZip(),
  archiveContentType: "application/zip",
  ...overrides,
});

const knowledgeArchive = () =>
  buildZip([
    {
      fileName: "knowledge.json",
      content: textContent(
        JSON.stringify({
          owner: "@acme",
          type: "knowledge",
          name: "code-review",
          version: "1.0.0",
          format: { name: "okf", version: "0.2" },
          bundleRoot: "src",
        }),
      ),
    },
    {
      fileName: "src/index.md",
      content: textContent('---\nokf_version: "0.2"\n---\n# Review\n\n- [Review](review.md)\n'),
    },
    {
      fileName: "src/review.md",
      content: textContent(
        "---\ntype: reference\ndescription: Review guidance\ntags: [review]\n---\n# Review\n",
      ),
    },
  ]);

describe("normalizePublishInput", () => {
  it.effect("resolves a Subagent from the manifest already validated by admission", () =>
    Effect.gen(function* () {
      const names: string[] = [];
      const tracer = Tracer.make({
        span(options) {
          names.push(options.name);
          return new Tracer.NativeSpan(options);
        },
      });
      const result = yield* normalizePublishInput({
        declaredIdentity: makeDeclaredIdentity({ type: "subagent" }),
        archive: {
          archiveContentType: "application/zip",
          content: buildZip([
            {
              fileName: "subagent.json",
              content: textContent(
                JSON.stringify({
                  owner: "@acme",
                  type: "subagent",
                  name: "code-review",
                  version: "1.0.0",
                  description: "Reviews code changes.",
                  core: { instructions: "src/review.md" },
                }),
              ),
            },
            { fileName: "src/review.md", content: textContent("Review carefully.") },
          ]),
        },
      }).pipe(Effect.withTracer(tracer), Effect.withTracerEnabled(true));
      expect(result.manifest.validated.type).toBe("subagent");
      expect(names.filter((name) => name === "axm.archive.decode-manifest")).toHaveLength(1);
      expect(names).not.toContain("axm.subagent.decode-manifest");
    }),
  );

  it.effect("reuses structural admission and reads each Knowledge member once per inspection", () =>
    Effect.gen(function* () {
      const spans: Tracer.NativeSpan[] = [];
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      const observe = <A, E>(effect: Effect.Effect<A, E>) =>
        effect.pipe(Effect.withTracer(tracer), Effect.withTracerEnabled(true));
      const admitted = yield* observe(validateArchive(knowledgeArchive()));
      for (let inspection = 0; inspection < 2; inspection++) {
        const result = yield* observe(
          normalizePublishInput({
            declaredIdentity: makeDeclaredIdentity({ type: "knowledge" }),
            archive: { content: admitted, archiveContentType: "application/zip" },
          }),
        );
        expect(result.archive).toBe(admitted);
        expect(result.manifest.validated.type).toBe("knowledge");
      }
      const count = (name: string) => spans.filter((span) => span.name === name).length;
      expect(count("axm.archive.parse")).toBe(1);
      expect(count("axm.archive.admit")).toBe(1);
      expect(count("axm.archive.read-member")).toBe(6);
      expect(count("axm.archive.decode-manifest")).toBe(2);
      expect(
        spans
          .filter((span) => span.name === "axm.archive.normalize")
          .map((span) => span.attributes.get("axm.work.reused")),
      ).toEqual([true, true]);
      expect(spans.every((span) => span.status._tag === "Ended")).toBe(true);
    }),
  );

  it.effect("keeps custom reader calls fresh and isolated from the owned archive", () =>
    Effect.gen(function* () {
      const bytes = knowledgeArchive();
      const admitted = yield* validateArchive(bytes);
      let indexReads = 0;
      const result = yield* normalizePublishInput({
        declaredIdentity: makeDeclaredIdentity({ type: "knowledge" }),
        archive: { content: admitted, archiveContentType: "application/zip" },
        readEntry: (copy, entry) =>
          Effect.gen(function* () {
            expect(copy).toEqual(bytes);
            const content = yield* defaultReadEntry(copy, entry);
            copy.fill(0);
            if (entry.fileName === "src/index.md" && ++indexReads === 2) {
              return yield* new ArchiveGuardrailError({
                code: "malformed_archive",
                message: "reader refused",
              });
            }
            return content;
          }),
      }).pipe(Effect.flip);
      expect(result).toMatchObject({ _tag: "FilteredPackageError", code: "content_invalid" });
      expect(indexReads).toBe(2);
      expect(admitted.copyBytes()).toEqual(bytes);
    }),
  );

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

  it.effect("rejects filtered Knowledge content with an escaping file resource", () =>
    Effect.gen(function* () {
      const zip = buildZip([
        {
          fileName: "knowledge.json",
          content: textContent(
            JSON.stringify({
              owner: "@acme",
              type: "knowledge",
              name: "code-review",
              version: "1.0.0",
              format: { name: "okf", version: "0.2" },
              bundleRoot: "src",
            }),
          ),
        },
        {
          fileName: "src/index.md",
          content: textContent(
            '---\nokf_version: "0.2"\n---\n# Review knowledge\n\n- [Review](review.md)\n',
          ),
        },
        {
          fileName: "src/review.md",
          content: textContent(
            [
              "---",
              "type: reference",
              "description: Review guidance",
              "tags: [review]",
              "sources:",
              "  - id: external",
              "    resource: ../outside.md",
              "---",
              "# Review",
              "",
            ].join("\n"),
          ),
        },
      ]);
      const error = yield* Effect.flip(
        normalizePublishInput({
          declaredIdentity: makeDeclaredIdentity({ type: "knowledge" }),
          archive: makeBody(zip),
        }),
      );

      expect(error._tag).toBe("FilteredPackageError");
      if (error._tag === "FilteredPackageError") {
        expect(error.code).toBe("content_invalid");
        expect(error.detail).toContain("escapes the Knowledge bundle");
      }
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
      manifest: { description: "Reviews code", core: { instructions: "src/code-review.md" } },
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
        implementations: [
          {
            id: "claude",
            protocol: "claude-code",
            bindings: [
              {
                id: "start",
                event: "SessionStart",
                handler: { type: "command", runtime: "bash", entrypoint: "src/hook.sh" },
              },
            ],
          },
        ],
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
  for (const size of [0, 1, 16_384, 65_536, 65_642]) {
    it.effect(`reads all ${size} bytes of a valid deflate entry`, () =>
      Effect.gen(function* () {
        const content = Uint8Array.from({ length: size }, (_, index) => index % 251);
        const zip = buildZip([{ fileName: "content.bin", content, compressionMethod: 8 }]);
        const entries = yield* parseZipCentralDirectory(zip);
        const entry = entries[0];
        expect(entry).toBeDefined();
        if (entry === undefined) return;

        expect(yield* defaultReadEntry(zip, entry)).toEqual(content);
      }),
    );
  }

  for (const declaredSize of [0, 16, 65_642]) {
    it.effect(`rejects expansion one byte beyond the declared ${declaredSize} bytes`, () =>
      Effect.gen(function* () {
        const content = new Uint8Array(declaredSize + 1);
        const zip = buildZip([{ fileName: "content.bin", content, compressionMethod: 8 }]);
        const entries = yield* parseZipCentralDirectory(zip);
        const entry = entries[0];
        expect(entry).toBeDefined();
        if (entry === undefined) return;

        const result = yield* defaultReadEntry(zip, {
          ...entry,
          uncompressedSize: declaredSize,
        }).pipe(Effect.flip);
        expect(result.code).toBe("decompression_limit_exceeded");
      }),
    );
  }

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
