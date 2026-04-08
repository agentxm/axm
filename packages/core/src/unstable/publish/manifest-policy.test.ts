import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { exactVersion, extensionName, handle } from "../test-helpers.js";
import { ArchiveGuardrailError, type ZipEntry } from "./archive-guardrails.js";
import {
  manifestFilenameForType,
  resolveManifest,
  validateDeclaredManifestAlignment,
} from "./manifest-policy.js";

const textEncoder = new TextEncoder();

const makeEntry = (fileName: string, overrides?: Partial<ZipEntry>): ZipEntry => ({
  fileName,
  compressedSize: 100,
  uncompressedSize: 100,
  compressionMethod: 0,
  externalAttributes: 0,
  localHeaderOffset: 0,
  ...overrides,
});

const makeReadEntry =
  (files: Record<string, string>) =>
  (fileName: string): Effect.Effect<Uint8Array, ArchiveGuardrailError> => {
    const content = files[fileName];
    if (content === undefined) {
      return Effect.fail(
        new ArchiveGuardrailError({
          code: "malformed_archive",
          message: `Entry not found: ${fileName}`,
          entry: fileName,
        }),
      );
    }

    return Effect.succeed(textEncoder.encode(content));
  };

describe("manifestFilenameForType", () => {
  it("maps supported extension types to manifest files", () => {
    expect(manifestFilenameForType("skill")).toBe("skill.json");
    expect(manifestFilenameForType("command")).toBe("command.json");
    expect(manifestFilenameForType("mcp-server")).toBe("mcp-server.json");
    expect(manifestFilenameForType("pack")).toBe("extension-pack.json");
  });
});

describe("resolveManifest", () => {
  it.effect("resolves a valid skill manifest", () =>
    Effect.gen(function* () {
      const manifest = JSON.stringify({
        owner: "@acme",
        type: "skill",
        name: "code-review",
        version: "1.0.0",
        description: "A code review skill",
      });

      const resolved = yield* resolveManifest({
        type: "skill",
        entries: [makeEntry("skill.json"), makeEntry("index.js")],
        readEntry: makeReadEntry({ "skill.json": manifest }),
      });

      expect(resolved.identity.owner).toBe("@acme");
      expect(resolved.identity.name).toBe("code-review");
    }),
  );

  it.effect("resolves a valid pack manifest with FQN dependencies", () =>
    Effect.gen(function* () {
      const manifest = JSON.stringify({
        owner: "@acme",
        type: "pack",
        name: "my-pack",
        version: "2.0.0",
        skills: { "@acme/skills/code-review": "^1.0.0" },
      });

      const resolved = yield* resolveManifest({
        type: "pack",
        entries: [makeEntry("extension-pack.json")],
        readEntry: makeReadEntry({ "extension-pack.json": manifest }),
      });

      expect(resolved.identity.name).toBe("my-pack");
    }),
  );

  it.effect("fails when the manifest is absent", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        resolveManifest({
          type: "skill",
          entries: [makeEntry("index.js")],
          readEntry: makeReadEntry({}),
        }),
      );

      expect(error._tag).toBe("ManifestError");
      if (error._tag === "ManifestError") {
        expect(error.code).toBe("manifest_missing");
      }
    }),
  );
});

describe("validateDeclaredManifestAlignment", () => {
  it("passes when declared identity and manifest identity match", () => {
    const result = validateDeclaredManifestAlignment(
      {
        owner: handle("@acme"),
        type: "skill",
        name: extensionName("code-review"),
        version: exactVersion("1.0.0"),
      },
      {
        owner: handle("@acme"),
        type: "skill",
        name: extensionName("code-review"),
        version: exactVersion("1.0.0"),
      },
    );

    expect(result._tag).toBe("Success");
  });

  it("fails on declared/manifest mismatch", () => {
    const result = validateDeclaredManifestAlignment(
      {
        owner: handle("@acme"),
        type: "skill",
        name: extensionName("code-review"),
        version: exactVersion("1.0.0"),
      },
      {
        owner: handle("@acme"),
        type: "skill",
        name: extensionName("other"),
        version: exactVersion("2.0.0"),
      },
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure.code).toBe("declared_manifest_mismatch");
      expect(result.failure.detail).toContain("name");
      expect(result.failure.detail).toContain("version");
    }
  });
});
