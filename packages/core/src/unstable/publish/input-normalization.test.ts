import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { exactVersion, extensionName, handle } from "../test-helpers.js";
import {
  normalizePublishInput,
  type DeclaredPublishIdentity,
  type PublishArchiveInput,
} from "./input-normalization.js";
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

  it.effect("normalizes context publish input", () =>
    Effect.gen(function* () {
      const zip = buildZip([
        {
          fileName: "docs.json",
          content: textContent(
            JSON.stringify({
              owner: "@acme",
              type: "docs",
              name: "baseline-docs",
              version: "1.0.0",
              contents: [
                {
                  source: { kind: "static", path: "README.md" },
                  target: "README.md",
                  mode: "sync-once",
                },
              ],
            }),
          ),
        },
        { fileName: "src/README.md", content: textContent("# docs") },
      ]);

      const result = yield* normalizePublishInput({
        declaredIdentity: makeDeclaredIdentity({
          type: "docs",
          name: extensionName("baseline-docs"),
        }),
        archive: makeBody(zip),
      });

      expect(result.type).toBe("docs");
      expect(result.manifest.fileName).toBe("docs.json");
    }),
  );
});
