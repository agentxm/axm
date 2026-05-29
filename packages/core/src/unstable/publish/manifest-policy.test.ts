import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { exactVersion, extensionName, handle } from "../test-helpers.js";
import { ArchiveGuardrailError, type ZipEntry } from "./archive-guardrails.js";
import {
  manifestFilenameForType,
  resolveManifest,
  validateCommandManifestHasNoAgentOverridesField,
  validateManifestHasNoAgentsField,
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
    expect(manifestFilenameForType("subagent")).toBe("subagent.json");
    expect(manifestFilenameForType("pack")).toBe("pack.json");
    expect(manifestFilenameForType("docs")).toBe("docs.json");
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

  it.effect("resolves a valid subagent manifest", () =>
    Effect.gen(function* () {
      const manifest = JSON.stringify({
        owner: "@acme",
        type: "subagent",
        name: "researcher",
        version: "1.0.0",
        description: "A research subagent",
      });

      const resolved = yield* resolveManifest({
        type: "subagent",
        entries: [makeEntry("subagent.json")],
        readEntry: makeReadEntry({ "subagent.json": manifest }),
      });

      expect(resolved.identity.owner).toBe("@acme");
      expect(resolved.identity.name).toBe("researcher");
      expect(resolved.identity.type).toBe("subagent");
    }),
  );

  it.effect("rejects deprecated manifest agents fields", () =>
    Effect.gen(function* () {
      const manifest = JSON.stringify({
        owner: "@acme",
        type: "command",
        name: "release-notes",
        version: "1.0.0",
        agents: ["claude-code"],
      });

      const error = yield* Effect.flip(
        resolveManifest({
          type: "command",
          entries: [makeEntry("command.json")],
          readEntry: makeReadEntry({ "command.json": manifest }),
        }),
      );

      expect(error._tag).toBe("ManifestError");
      if (error._tag === "ManifestError") {
        expect(error.code).toBe("manifest_schema_invalid");
        expect(error.detail).toContain("settings.agents");
      }
    }),
  );

  it.effect("rejects deprecated command manifest agentOverrides fields", () =>
    Effect.gen(function* () {
      const manifest = JSON.stringify({
        owner: "@acme",
        type: "command",
        name: "release-notes",
        version: "1.0.0",
        agentOverrides: {
          codex: { model: "o3" },
        },
      });

      const error = yield* Effect.flip(
        resolveManifest({
          type: "command",
          entries: [makeEntry("command.json")],
          readEntry: makeReadEntry({ "command.json": manifest }),
        }),
      );

      expect(error._tag).toBe("ManifestError");
      if (error._tag === "ManifestError") {
        expect(error.code).toBe("manifest_schema_invalid");
        expect(error.detail).toContain("command content file frontmatter");
      }
    }),
  );

  it.effect("resolves a valid pack manifest with FQN dependencies", () =>
    Effect.gen(function* () {
      const manifest = JSON.stringify({
        owner: "@acme",
        type: "pack",
        name: "my-pack",
        version: "2.0.0",
        dependencies: { "@acme/skills/code-review": "^1.0.0" },
      });

      const resolved = yield* resolveManifest({
        type: "pack",
        entries: [makeEntry("pack.json")],
        readEntry: makeReadEntry({ "pack.json": manifest }),
      });

      expect(resolved.identity.name).toBe("my-pack");
    }),
  );

  it.effect("resolves a valid context manifest", () =>
    Effect.gen(function* () {
      const manifest = JSON.stringify({
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
      });

      const resolved = yield* resolveManifest({
        type: "docs",
        entries: [makeEntry("docs.json"), makeEntry("src/README.md")],
        readEntry: makeReadEntry({ "docs.json": manifest }),
      });

      expect(resolved.identity.name).toBe("baseline-docs");
      expect(resolved.identity.type).toBe("docs");
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

describe("validateManifestHasNoAgentsField", () => {
  it("fails with guidance to use settings.agents", () => {
    const result = validateManifestHasNoAgentsField("subagent.json", {
      owner: "@acme",
      type: "subagent",
      name: "researcher",
      version: "1.0.0",
      agents: ["claude-code"],
    });

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure.detail).toContain("settings.agents");
    }
  });
});

describe("validateCommandManifestHasNoAgentOverridesField", () => {
  it("fails with guidance to move overrides to content frontmatter", () => {
    const result = validateCommandManifestHasNoAgentOverridesField("command.json", {
      owner: "@acme",
      type: "command",
      name: "release-notes",
      version: "1.0.0",
      agentOverrides: { codex: { model: "o3" } },
    });

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure.detail).toContain("command content file frontmatter");
    }
  });
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
