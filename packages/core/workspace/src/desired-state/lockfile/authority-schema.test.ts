import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import {
  LOCKFILE_VERSION,
  LockfileSchema,
  McpServerLockEntrySchema,
  PackLockEntrySchema,
  SkillLockEntrySchema,
} from "./schema.js";

const decodeLockfile = Schema.decodeUnknownSync(LockfileSchema);

describe("authoritative external-resolution lockfile", () => {
  it("uses a clean-cut schema version", () => {
    expect(LOCKFILE_VERSION).toBe(7);
    expect(
      decodeLockfile({ lockfileVersion: 7, skills: {} }, { onExcessProperty: "error" }),
    ).toEqual({ lockfileVersion: 7, skills: {} });
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
      type: "github",
      sourceType: "github",
      sourceName: "github",
      endpoint: "https://github.com",
      extensionType: "skill",
      workspaceName: "review",
      packageFormat: "agentxm",
      packageOwner: "@acme",
      packageName: "review",
      owner: "acme",
      repo: "extensions",
      path: "skills/review",
      resolvedCommit: "8d7f9e94a9c6db2b886560179252de77739c0b32",
      resolvedTree: "5a21b5d70e623dcf6af0885eb595d9d8bfb3a148",
      contentIdentity: "sha256-git-tree",
      treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
    };
    const local = {
      type: "local",
      sourceType: "local",
      sourceName: "local",
      extensionType: "skill",
      workspaceName: "review",
      packageFormat: "agentxm",
      packageOwner: "@acme",
      packageName: "review",
      path: "../extension-sources/review",
      contentIdentity: "sha256-local-tree",
      treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
    };

    expect(
      Schema.decodeUnknownSync(SkillLockEntrySchema)(git, {
        onExcessProperty: "error",
      }),
    ).toEqual({ ...git, endpoint: new URL(git.endpoint) });
    expect(
      Schema.decodeUnknownSync(SkillLockEntrySchema)(local, {
        onExcessProperty: "error",
      }),
    ).toEqual(local);
    expect(() =>
      Schema.decodeUnknownSync(SkillLockEntrySchema)(
        { type: "github", owner: "acme", repo: "extensions" },
        { onExcessProperty: "error" },
      ),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(SkillLockEntrySchema)(
        { type: "local", path: "../extension-sources/review" },
        { onExcessProperty: "error" },
      ),
    ).toThrow();
  });

  it("keeps registry identity and provenance without receipt fields", () => {
    const registry = {
      type: "registry",
      sourceType: "registry",
      endpoint: "https://registry.agentxm.ai",
      extensionType: "skill",
      workspaceName: "review",
      packageFormat: "agentxm",
      owner: "@acme",
      name: "review",
      resolvedVersion: "1.2.3",
      integrity: "sha512-archive",
      sourceName: "agentxm",
      publisherBindingId: "hbnd_acme",
      treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
    };

    expect(
      Schema.decodeUnknownSync(SkillLockEntrySchema)(registry, {
        onExcessProperty: "error",
      }),
    ).toEqual({ ...registry, endpoint: new URL(registry.endpoint) });
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

  it("stores Registry Pack manifest identity without receipt-derived member maps", () => {
    const pack = {
      type: "registry",
      sourceType: "registry",
      endpoint: "https://registry.agentxm.ai",
      extensionType: "pack",
      workspaceName: "toolkit",
      packageFormat: "agentxm",
      owner: "@acme",
      name: "toolkit",
      resolvedVersion: "2.0.0",
      integrity: "sha512-pack-archive",
      manifestContentIdentity: "sha256-pack-manifest",
      sourceName: "agentxm",
      publisherBindingId: "hbnd_acme",
      treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
    };

    expect(
      Schema.decodeUnknownSync(PackLockEntrySchema)(pack, {
        onExcessProperty: "error",
      }),
    ).toEqual({ ...pack, endpoint: new URL(pack.endpoint) });
    expect(() =>
      Schema.decodeUnknownSync(PackLockEntrySchema)(
        { ...pack, resolvedSkills: {} },
        { onExcessProperty: "error" },
      ),
    ).toThrow();
  });

  it("rejects non-canonical lock versions and unknown top-level state", () => {
    expect(() =>
      decodeLockfile({ lockfileVersion: 4, skills: {} }, { onExcessProperty: "error" }),
    ).toThrow();
    expect(() =>
      decodeLockfile(
        { lockfileVersion: 7, skills: {}, receiptHistory: {} },
        { onExcessProperty: "error" },
      ),
    ).toThrow();
  });
});
