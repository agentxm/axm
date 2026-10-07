import { storedLockfileFixture } from "../../observed/__fixtures__/decoders.js";
import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { computePackManifestContentIdentity } from "../../workspace/pack-manifest-content-identity.js";
import { installableExtensionTypes } from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  LOCK_ENTRY_SCHEMA_BY_TYPE,
  LOCKFILE_VERSION,
  LockfileSchema,
  McpServerLockEntrySchema,
  PackLockEntrySchema,
  SkillLockEntrySchema,
} from "./schema.js";

const decodeLockfile = Schema.decodeUnknownSync(LockfileSchema);
const encodeLockfile = Schema.encodeSync(LockfileSchema);

describe("authoritative external-resolution lockfile", () => {
  it("defines a lock-entry schema for every installable extension type", () => {
    expect(Object.keys(LOCK_ENTRY_SCHEMA_BY_TYPE)).toEqual(installableExtensionTypes);
  });

  it("uses a clean-cut schema version", () => {
    expect(LOCKFILE_VERSION).toBe(11);
    expect(
      decodeLockfile(
        { lockfileVersion: 11, packages: {}, skills: {} },
        { onExcessProperty: "error" },
      ),
    ).toEqual({ lockfileVersion: 11, skills: {} });
    expect(() =>
      decodeLockfile({ lockfileVersion: 7, skills: {} }, { onExcessProperty: "error" }),
    ).toThrow();
  });

  it("rejects workspace-authored and inline entries", () => {
    const workspace = {
      type: "workspace",
      owner: "@acme",
      extensionType: "skill",
      name: "review",
      version: "1.0.0",
      sourceHash: "workspace-content",
      installedAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
    };
    const inline = {
      type: "inline",
      command: "example",
      installedAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
    };

    expect(() =>
      Schema.decodeUnknownSync(SkillLockEntrySchema)(workspace, {
        onExcessProperty: "error",
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(McpServerLockEntrySchema)(inline, {
        onExcessProperty: "error",
      }),
    ).toThrow();
  });

  it("requires immutable identities for Git and local-path resolutions", () => {
    const git = {
      source: {
        type: "git",
        url: "https://github.com/acme/extensions.git",
        path: "skills/review",
      },
      identity: { owner: "@acme", name: "review" },
      resolved: {
        commit: "8d7f9e94a9c6db2b886560179252de77739c0b32",
        tree: "5a21b5d70e623dcf6af0885eb595d9d8bfb3a148",
      },
      treeIntegrity: `sha256-tree-v2:${"0".repeat(64)}`,
    };
    const local = {
      source: { type: "path", path: "/extension-sources/review" },
      identity: { owner: "@acme", name: "review" },
      resolved: { tree: `sha256-tree-v2:${"0".repeat(64)}` },
      treeIntegrity: `sha256-tree-v2:${"0".repeat(64)}`,
    };

    expect(
      Schema.decodeUnknownSync(SkillLockEntrySchema)(git, {
        onExcessProperty: "error",
      }),
    ).toEqual({ ...git, source: { ...git.source, url: new URL(git.source.url) } });
    expect(
      Schema.decodeUnknownSync(SkillLockEntrySchema)(local, {
        onExcessProperty: "error",
      }),
    ).toEqual(local);
    expect(() =>
      Schema.decodeUnknownSync(SkillLockEntrySchema)(
        { source: { type: "git", url: "https://github.com/acme/extensions.git" } },
        { onExcessProperty: "error" },
      ),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(SkillLockEntrySchema)(
        { source: { type: "path", path: "/extension-sources/review" } },
        { onExcessProperty: "error" },
      ),
    ).toThrow();
  });

  it("round-trips every self-describing source locator", () => {
    const treeIntegrity = `sha256-tree-v2:${"0".repeat(64)}`;
    const lockfile = {
      lockfileVersion: 11,
      skills: {
        git: {
          source: {
            type: "git",
            url: "ssh://git@example.com/acme/extensions.git",
            path: "skills/review",
            revision: "release",
          },
          identity: { owner: "@acme", name: "review" },
          resolved: { commit: "commit-id", tree: "tree-id" },
          treeIntegrity,
        },
        registry: {
          source: { type: "registry", url: "https://registry.example.com/" },
          identity: { owner: "@acme", name: "published" },
          resolved: {
            version: "1.2.3",
            integrity: "sha512-archive",
            publisherBindingId: "hbnd_acme",
          },
          treeIntegrity,
        },
        path: {
          source: { type: "path", path: "/extension-sources/local" },
          identity: { owner: "@acme", name: "local" },
          resolved: { tree: `sha256-tree-v2:${"0".repeat(64)}` },
          treeIntegrity,
        },
      },
    };

    const stored = storedLockfileFixture(lockfile);
    expect(encodeLockfile(decodeLockfile(stored, { onExcessProperty: "error" }))).toEqual(stored);
  });

  it("keeps registry identity and provenance without receipt fields", () => {
    const registry = {
      source: { type: "registry", url: "https://registry.agentxm.ai" },
      identity: { owner: "@acme", name: "review" },
      resolved: {
        version: "1.2.3",
        integrity: "sha512-archive",
        publisherBindingId: "hbnd_acme",
      },
      treeIntegrity: `sha256-tree-v2:${"0".repeat(64)}`,
    };

    expect(
      Schema.decodeUnknownSync(SkillLockEntrySchema)(registry, {
        onExcessProperty: "error",
      }),
    ).toEqual({
      ...registry,
      source: { ...registry.source, url: new URL(registry.source.url) },
    });
    expect(() =>
      Schema.decodeUnknownSync(SkillLockEntrySchema)(
        {
          ...registry,
          installedAt: "2026-08-13T00:00:00.000Z",
          updatedAt: "2026-08-13T00:00:00.000Z",
          sourceHash: "receipt-hash",
        },
        { onExcessProperty: "error" },
      ),
    ).toThrow();
  });

  it("stores Registry Pack dependency constraints with a consistent semantic identity", () => {
    const pack = {
      source: { type: "registry", url: "https://registry.agentxm.ai" },
      identity: { owner: "@acme", name: "toolkit" },
      resolved: {
        version: "2.0.0",
        integrity: "sha512-pack-archive",
        publisherBindingId: "hbnd_acme",
      },
      manifestVersion: "2.0.0",
      manifestContentIdentity: computePackManifestContentIdentity({
        owner: "@acme",
        type: "pack",
        name: "toolkit",
        version: "2.0.0",
        dependencies: { "@acme/skills/review": "^1.0.0" },
      }),
      dependencies: { "@acme/skills/review": "^1.0.0" },
      treeIntegrity: `sha256-tree-v2:${"0".repeat(64)}`,
    };

    expect(
      Schema.decodeUnknownSync(PackLockEntrySchema)(pack, {
        onExcessProperty: "error",
      }),
    ).toEqual({ ...pack, source: { ...pack.source, url: new URL(pack.source.url) } });
    for (const invalid of [
      { ...pack, dependencies: undefined },
      { ...pack, dependencies: { "@acme/packs/nested": "*" } },
      { ...pack, dependencies: { "@acme/skills/review": "^2.0.0" } },
      { ...pack, manifestContentIdentity: "inconsistent" },
      { ...pack, manifestVersion: "1.0.0" },
      { ...pack, members: ["@acme/skills/review"] },
    ]) {
      expect(() =>
        Schema.decodeUnknownSync(PackLockEntrySchema)(invalid, {
          onExcessProperty: "error",
        }),
      ).toThrow();
    }
    expect(() =>
      Schema.decodeUnknownSync(PackLockEntrySchema)(
        { ...pack, resolvedSkills: {} },
        { onExcessProperty: "error" },
      ),
    ).toThrow();
  });

  it("round-trips local Pack authority with its dependency declarations", () => {
    const pack = {
      source: { type: "path", path: "catalog/packs/toolkit" },
      sourceRoot: "catalog",
      identity: { owner: "@acme", name: "toolkit" },
      resolved: { tree: `sha256-tree-v2:${"0".repeat(64)}` },
      treeIntegrity: `sha256-tree-v2:${"0".repeat(64)}`,
      manifestVersion: "2.0.0",
      manifestContentIdentity: computePackManifestContentIdentity({
        owner: "@acme",
        type: "pack",
        name: "toolkit",
        version: "2.0.0",
        dependencies: { "@acme/skills/review": "^1.0.0", "@acme/rules/house-style": "*" },
      }),
      dependencies: { "@acme/skills/review": "^1.0.0", "@acme/rules/house-style": "*" },
    };

    expect(
      Schema.decodeUnknownSync(PackLockEntrySchema)(pack, {
        onExcessProperty: "error",
      }),
    ).toEqual(pack);
  });

  it("rejects non-canonical lock versions and unknown top-level state", () => {
    expect(() =>
      decodeLockfile({ lockfileVersion: 4, skills: {} }, { onExcessProperty: "error" }),
    ).toThrow();
    expect(() =>
      decodeLockfile(
        { lockfileVersion: 11, skills: {}, receiptHistory: {} },
        { onExcessProperty: "error" },
      ),
    ).toThrow();
  });
});
