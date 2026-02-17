/**
 * Tests for LocalRegistryClient.
 *
 * Tests all 5 client methods: getExtensions, scopeExists,
 * getExtensionVersion, publishExtension, extensionExists.
 */

import { execSync, type ExecSyncOptions } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";

import { computeIntegrity } from "../utils/integrity.js";
import type { ExtensionIndex, VersionEntry } from "./local-schema.js";
import type { GetExtensionsArgs } from "./client.js";
import { createRegistryClient } from "./client.js";
import { createLocalRegistryClient } from "./local-client.js";
import { createRemoteRegistryClient } from "./client-remote.js";

/** Resolve FileSystem + Path and create a local registry client in one step. */
const makeLocalClient = (registryRoot: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return createLocalRegistryClient(registryRoot, fs, path);
  });

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeVersionEntry = (overrides?: Partial<VersionEntry>): VersionEntry => ({
  version: "1.0.0",
  published: "2025-01-01T00:00:00Z",
  integrity: "sha512-AAAA==",
  ...overrides,
});

const makeIndex = (overrides?: Partial<ExtensionIndex>): ExtensionIndex => ({
  name: "my-skill",
  scope: "@test",
  type: "skill",
  versions: [makeVersionEntry()],
  ...overrides,
});

const defaultSearchOptions: GetExtensionsArgs = {
  names: [],
  types: ["skill"],
  limit: Option.none(),
  offset: 0,
};

/** Create a minimal zip archive with a single file. */
const createTestZip = (fileName: string, content: string): Uint8Array => {
  const dir = mkdtempSync(nodePath.join(tmpdir(), "test-zip-"));
  try {
    writeFileSync(nodePath.join(dir, fileName), content);
    const opts: ExecSyncOptions = { stdio: "pipe" };
    execSync(`cd "${dir}" && zip -q archive.zip "${fileName}"`, opts);
    return readFileSync(nodePath.join(dir, "archive.zip"));
  } finally {
    rmSync(dir, { recursive: true });
  }
};

const makeRegistryDir = (): string => mkdtempSync(nodePath.join(tmpdir(), "test-registry-"));

// -----------------------------------------------------------------------------
// LocalRegistryClient.getExtensions
// -----------------------------------------------------------------------------

describe("LocalRegistryClient.getExtensions", () => {
  it.effect("returns empty when registry directory does not exist", () =>
    Effect.gen(function* () {
      const client = yield* makeLocalClient("/nonexistent/path");
      const result = yield* client.getExtensions(defaultSearchOptions);
      expect(result.extensions).toHaveLength(0);
      expect(result.pagination).toEqual({ total: 0, limit: 0, offset: 0, hasMore: false });
    }).pipe(Effect.provide(NodeContext.layer)),
  );

  it.effect("finds skills by name from index.json", () => {
    const registryRoot = makeRegistryDir();
    const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(skillDir, { recursive: true });
      yield* fs.writeFileString(nodePath.join(skillDir, "index.json"), JSON.stringify(makeIndex()));

      const client = yield* makeLocalClient(registryRoot);
      const result = yield* client.getExtensions({
        ...defaultSearchOptions,
        names: ["my-skill"],
      });

      expect(result.extensions).toHaveLength(1);
      expect(result.extensions[0]!.type).toBe("skill");
      expect(result.extensions[0]!.name).toBe("my-skill");
      expect(result.extensions[0]!.version).toBe("1.0.0");
      expect(result.extensions[0]!.scope).toBe("@test");
      expect(result.pagination).toEqual({ total: 1, limit: 1, offset: 0, hasMore: false });
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
      ),
      Effect.provide(NodeContext.layer),
    );
  });

  it.effect("returns empty when no matching name exists", () => {
    const registryRoot = makeRegistryDir();
    const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "other-skill");

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(skillDir, { recursive: true });
      yield* fs.writeFileString(
        nodePath.join(skillDir, "index.json"),
        JSON.stringify(makeIndex({ name: "other-skill" })),
      );

      const client = yield* makeLocalClient(registryRoot);
      const result = yield* client.getExtensions({
        ...defaultSearchOptions,
        names: ["nonexistent"],
      });
      expect(result.extensions).toHaveLength(0);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
      ),
      Effect.provide(NodeContext.layer),
    );
  });

  it.effect("returns empty when index has no versions", () => {
    const registryRoot = makeRegistryDir();
    const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(skillDir, { recursive: true });
      yield* fs.writeFileString(
        nodePath.join(skillDir, "index.json"),
        JSON.stringify(makeIndex({ versions: [] })),
      );

      const client = yield* makeLocalClient(registryRoot);
      const result = yield* client.getExtensions({
        ...defaultSearchOptions,
        names: ["my-skill"],
      });
      expect(result.extensions).toHaveLength(0);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
      ),
      Effect.provide(NodeContext.layer),
    );
  });

  it.effect("finds all extensions when names is empty", () => {
    const registryRoot = makeRegistryDir();
    const skill1Dir = nodePath.join(registryRoot, "extensions", "@test", "skills", "skill-a");
    const skill2Dir = nodePath.join(registryRoot, "extensions", "@test", "skills", "skill-b");

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(skill1Dir, { recursive: true });
      yield* fs.writeFileString(
        nodePath.join(skill1Dir, "index.json"),
        JSON.stringify(makeIndex({ name: "skill-a" })),
      );
      yield* fs.makeDirectory(skill2Dir, { recursive: true });
      yield* fs.writeFileString(
        nodePath.join(skill2Dir, "index.json"),
        JSON.stringify(makeIndex({ name: "skill-b" })),
      );

      const client = yield* makeLocalClient(registryRoot);
      const result = yield* client.getExtensions(defaultSearchOptions);
      expect(result.extensions).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
      ),
      Effect.provide(NodeContext.layer),
    );
  });

  it.effect("finds mcp-server extensions", () => {
    const registryRoot = makeRegistryDir();
    const serverDir = nodePath.join(
      registryRoot,
      "extensions",
      "@test",
      "mcp-servers",
      "my-server",
    );

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(serverDir, { recursive: true });
      yield* fs.writeFileString(
        nodePath.join(serverDir, "index.json"),
        JSON.stringify(makeIndex({ name: "my-server", type: "mcp-server" })),
      );

      const client = yield* makeLocalClient(registryRoot);
      const result = yield* client.getExtensions({
        ...defaultSearchOptions,
        types: ["mcp-server"],
        names: ["my-server"],
      });
      expect(result.extensions).toHaveLength(1);
      expect(result.extensions[0]!.type).toBe("mcp-server");
      expect(result.extensions[0]!.name).toBe("my-server");
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
      ),
      Effect.provide(NodeContext.layer),
    );
  });

  it.effect("paginates with limit and offset", () => {
    const registryRoot = makeRegistryDir();
    const skill1Dir = nodePath.join(registryRoot, "extensions", "@test", "skills", "skill-a");
    const skill2Dir = nodePath.join(registryRoot, "extensions", "@test", "skills", "skill-b");
    const skill3Dir = nodePath.join(registryRoot, "extensions", "@test", "skills", "skill-c");

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      for (const [dir, name] of [
        [skill1Dir, "skill-a"],
        [skill2Dir, "skill-b"],
        [skill3Dir, "skill-c"],
      ] as const) {
        yield* fs.makeDirectory(dir, { recursive: true });
        yield* fs.writeFileString(
          nodePath.join(dir, "index.json"),
          JSON.stringify(makeIndex({ name })),
        );
      }

      const client = yield* makeLocalClient(registryRoot);

      // limit=2, offset=0 → first 2
      const page1 = yield* client.getExtensions({
        ...defaultSearchOptions,
        limit: Option.some(2),
        offset: 0,
      });
      expect(page1.extensions).toHaveLength(2);
      expect(page1.pagination).toEqual({ total: 3, limit: 2, offset: 0, hasMore: true });

      // limit=2, offset=2 → last 1
      const page2 = yield* client.getExtensions({
        ...defaultSearchOptions,
        limit: Option.some(2),
        offset: 2,
      });
      expect(page2.extensions).toHaveLength(1);
      expect(page2.pagination).toEqual({ total: 3, limit: 2, offset: 2, hasMore: false });

      // no limit, offset=1 → skip 1
      const page3 = yield* client.getExtensions({
        ...defaultSearchOptions,
        limit: Option.none(),
        offset: 1,
      });
      expect(page3.extensions).toHaveLength(2);
      expect(page3.pagination).toEqual({ total: 3, limit: 3, offset: 1, hasMore: false });
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
      ),
      Effect.provide(NodeContext.layer),
    );
  });
});

// -----------------------------------------------------------------------------
// LocalRegistryClient.scopeExists
// -----------------------------------------------------------------------------

describe("LocalRegistryClient.scopeExists", () => {
  it.effect("returns true when scope directory exists", () => {
    const registryRoot = makeRegistryDir();
    const scopeDir = nodePath.join(registryRoot, "extensions", "@test", "skills");

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(scopeDir, { recursive: true });

      const client = yield* makeLocalClient(registryRoot);
      const exists = yield* client.scopeExists("@test");
      expect(exists).toBe(true);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
      ),
      Effect.provide(NodeContext.layer),
    );
  });

  it.effect("returns false when scope directory does not exist", () => {
    const registryRoot = makeRegistryDir();

    return Effect.gen(function* () {
      const client = yield* makeLocalClient(registryRoot);
      const exists = yield* client.scopeExists("@missing");
      expect(exists).toBe(false);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
      ),
      Effect.provide(NodeContext.layer),
    );
  });
});

// -----------------------------------------------------------------------------
// LocalRegistryClient.getExtensionVersion
// -----------------------------------------------------------------------------

describe("LocalRegistryClient.getExtensionVersion", () => {
  it.effect("reads archive bytes for explicit version", () => {
    const registryRoot = makeRegistryDir();
    const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");
    const archive = createTestZip("SKILL.md", "# My Skill");

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(skillDir, { recursive: true });
      yield* fs.writeFile(nodePath.join(skillDir, "1.0.0.zip"), archive);

      const client = yield* makeLocalClient(registryRoot);
      const bytes = yield* client.getExtensionVersion({
        scope: "@test",
        type: "skill",
        name: "my-skill",
        version: Option.some("1.0.0"),
      });
      expect(bytes.length).toBeGreaterThan(0);
      expect(bytes.length).toBe(archive.length);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
      ),
      Effect.provide(NodeContext.layer),
    );
  });

  it.effect("resolves latest version when version is None", () => {
    const registryRoot = makeRegistryDir();
    const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");
    const archive = createTestZip("SKILL.md", "# My Skill");

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(skillDir, { recursive: true });
      yield* fs.writeFileString(
        nodePath.join(skillDir, "index.json"),
        JSON.stringify(makeIndex({ versions: [makeVersionEntry({ version: "2.0.0" })] })),
      );
      yield* fs.writeFile(nodePath.join(skillDir, "2.0.0.zip"), archive);

      const client = yield* makeLocalClient(registryRoot);
      const bytes = yield* client.getExtensionVersion({
        scope: "@test",
        type: "skill",
        name: "my-skill",
        version: Option.none(),
      });
      expect(bytes.length).toBeGreaterThan(0);
      expect(bytes.length).toBe(archive.length);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
      ),
      Effect.provide(NodeContext.layer),
    );
  });

  it.effect("fails when archive does not exist", () => {
    const registryRoot = makeRegistryDir();

    return Effect.gen(function* () {
      const client = yield* makeLocalClient(registryRoot);
      const result = yield* client
        .getExtensionVersion({
          scope: "@test",
          type: "skill",
          name: "missing",
          version: Option.some("1.0.0"),
        })
        .pipe(Effect.either);
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left.code).toBe("REGISTRY_FETCH_FAILED");
      }
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
      ),
      Effect.provide(NodeContext.layer),
    );
  });

  it.effect("fails when version is None and no versions exist", () => {
    const registryRoot = makeRegistryDir();
    const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(skillDir, { recursive: true });
      yield* fs.writeFileString(
        nodePath.join(skillDir, "index.json"),
        JSON.stringify(makeIndex({ versions: [] })),
      );

      const client = yield* makeLocalClient(registryRoot);
      const result = yield* client
        .getExtensionVersion({
          scope: "@test",
          type: "skill",
          name: "my-skill",
          version: Option.none(),
        })
        .pipe(Effect.either);
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left.code).toBe("REGISTRY_FETCH_FAILED");
      }
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
      ),
      Effect.provide(NodeContext.layer),
    );
  });
});

// -----------------------------------------------------------------------------
// LocalRegistryClient.publishExtension
// -----------------------------------------------------------------------------

describe("LocalRegistryClient.publishExtension", () => {
  it.effect("creates new index and writes archive", () => {
    const registryRoot = makeRegistryDir();
    const archive = createTestZip("SKILL.md", "content");

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const integrity = yield* computeIntegrity(archive);
      const entry = makeVersionEntry({ integrity });
      const client = yield* makeLocalClient(registryRoot);
      yield* client.publishExtension({
        scope: "@test",
        type: "skill",
        name: "my-skill",
        version: "1.0.0",
        archive,
        metadata: entry,
      });

      const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");
      const indexContent = yield* fs.readFileString(nodePath.join(skillDir, "index.json"));
      const index = JSON.parse(indexContent) as ExtensionIndex;
      expect(index.name).toBe("my-skill");
      expect(index.scope).toBe("@test");
      expect(index.versions).toHaveLength(1);
      expect(index.versions[0]!.version).toBe("1.0.0");

      const archiveExists = yield* fs.exists(nodePath.join(skillDir, "1.0.0.zip"));
      expect(archiveExists).toBe(true);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
      ),
      Effect.provide(NodeContext.layer),
    );
  });

  it.effect("prepends new version to existing index", () => {
    const registryRoot = makeRegistryDir();
    const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");
    const v1Archive = createTestZip("SKILL.md", "v1");
    const v2Archive = createTestZip("SKILL.md", "v2");

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const v1Integrity = yield* computeIntegrity(v1Archive);
      const v1Entry = makeVersionEntry({ version: "1.0.0", integrity: v1Integrity });
      const v2Integrity = yield* computeIntegrity(v2Archive);
      const v2Entry = makeVersionEntry({ version: "2.0.0", integrity: v2Integrity });

      yield* fs.makeDirectory(skillDir, { recursive: true });
      yield* fs.writeFileString(
        nodePath.join(skillDir, "index.json"),
        JSON.stringify(makeIndex({ versions: [v1Entry] })),
      );
      yield* fs.writeFile(nodePath.join(skillDir, "1.0.0.zip"), v1Archive);

      const client = yield* makeLocalClient(registryRoot);
      yield* client.publishExtension({
        scope: "@test",
        type: "skill",
        name: "my-skill",
        version: "2.0.0",
        archive: v2Archive,
        metadata: v2Entry,
      });

      const indexContent = yield* fs.readFileString(nodePath.join(skillDir, "index.json"));
      const index = JSON.parse(indexContent) as ExtensionIndex;
      expect(index.versions).toHaveLength(2);
      expect(index.versions[0]!.version).toBe("2.0.0");
      expect(index.versions[1]!.version).toBe("1.0.0");
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
      ),
      Effect.provide(NodeContext.layer),
    );
  });

  it.effect("is idempotent when same version and integrity", () => {
    const registryRoot = makeRegistryDir();
    const archive = createTestZip("SKILL.md", "content");

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const integrity = yield* computeIntegrity(archive);
      const entry = makeVersionEntry({ integrity });
      const client = yield* makeLocalClient(registryRoot);
      const publishArgs = {
        scope: "@test" as const,
        type: "skill" as const,
        name: "my-skill",
        version: "1.0.0",
        archive,
        metadata: entry,
      };
      yield* client.publishExtension(publishArgs);
      yield* client.publishExtension(publishArgs);

      const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");
      const indexContent = yield* fs.readFileString(nodePath.join(skillDir, "index.json"));
      const index = JSON.parse(indexContent) as ExtensionIndex;
      expect(index.versions).toHaveLength(1);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
      ),
      Effect.provide(NodeContext.layer),
    );
  });

  it.effect("fails when same version but different integrity", () => {
    const registryRoot = makeRegistryDir();
    const archive1 = createTestZip("SKILL.md", "content1");
    const archive2 = createTestZip("SKILL.md", "content2");

    return Effect.gen(function* () {
      const integrity1 = yield* computeIntegrity(archive1);
      const entry1 = makeVersionEntry({ integrity: integrity1 });
      const integrity2 = yield* computeIntegrity(archive2);
      const entry2 = makeVersionEntry({ integrity: integrity2 });

      const client = yield* makeLocalClient(registryRoot);
      yield* client.publishExtension({
        scope: "@test",
        type: "skill",
        name: "my-skill",
        version: "1.0.0",
        archive: archive1,
        metadata: entry1,
      });

      const result = yield* client
        .publishExtension({
          scope: "@test",
          type: "skill",
          name: "my-skill",
          version: "1.0.0",
          archive: archive2,
          metadata: entry2,
        })
        .pipe(Effect.either);

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left.code).toBe("REGISTRY_PUBLISH_FAILED");
      }
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
      ),
      Effect.provide(NodeContext.layer),
    );
  });
});

// -----------------------------------------------------------------------------
// LocalRegistryClient.extensionExists
// -----------------------------------------------------------------------------

describe("LocalRegistryClient.extensionExists", () => {
  it.effect("returns true when index.json exists", () => {
    const registryRoot = makeRegistryDir();
    const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(skillDir, { recursive: true });
      yield* fs.writeFileString(nodePath.join(skillDir, "index.json"), JSON.stringify(makeIndex()));

      const client = yield* makeLocalClient(registryRoot);
      const exists = yield* client.extensionExists({
        scope: "@test",
        type: "skill",
        name: "my-skill",
      });
      expect(exists).toBe(true);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
      ),
      Effect.provide(NodeContext.layer),
    );
  });

  it.effect("returns false when extension does not exist", () => {
    const registryRoot = makeRegistryDir();

    return Effect.gen(function* () {
      const client = yield* makeLocalClient(registryRoot);
      const exists = yield* client.extensionExists({
        scope: "@test",
        type: "skill",
        name: "nonexistent",
      });
      expect(exists).toBe(false);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
      ),
      Effect.provide(NodeContext.layer),
    );
  });
});

// -----------------------------------------------------------------------------
// RemoteRegistryClient
// -----------------------------------------------------------------------------

describe("RemoteRegistryClient", () => {
  const client = createRemoteRegistryClient();

  it.effect("getExtensions fails with remote not supported", () =>
    Effect.gen(function* () {
      const result = yield* client.getExtensions(defaultSearchOptions).pipe(Effect.either);
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left.code).toBe("REGISTRY_REMOTE_NOT_SUPPORTED");
        expect(result.left.what).toContain("remote registry not yet supported");
      }
    }).pipe(Effect.provide(NodeContext.layer)),
  );

  it.effect("scopeExists fails with remote not supported", () =>
    Effect.gen(function* () {
      const result = yield* client.scopeExists("@test").pipe(Effect.either);
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left.code).toBe("REGISTRY_REMOTE_NOT_SUPPORTED");
      }
    }).pipe(Effect.provide(NodeContext.layer)),
  );

  it.effect("getExtensionVersion fails with remote not supported", () =>
    Effect.gen(function* () {
      const result = yield* client
        .getExtensionVersion({
          scope: "@test",
          type: "skill",
          name: "my-skill",
          version: Option.some("1.0.0"),
        })
        .pipe(Effect.either);
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left.code).toBe("REGISTRY_REMOTE_NOT_SUPPORTED");
      }
    }).pipe(Effect.provide(NodeContext.layer)),
  );

  it.effect("publishExtension fails with remote not supported", () =>
    Effect.gen(function* () {
      const result = yield* client
        .publishExtension({
          scope: "@test",
          type: "skill",
          name: "my-skill",
          version: "1.0.0",
          archive: new Uint8Array(),
          metadata: makeVersionEntry(),
        })
        .pipe(Effect.either);
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left.code).toBe("REGISTRY_REMOTE_NOT_SUPPORTED");
      }
    }).pipe(Effect.provide(NodeContext.layer)),
  );

  it.effect("extensionExists fails with remote not supported", () =>
    Effect.gen(function* () {
      const result = yield* client
        .extensionExists({ scope: "@test", type: "skill", name: "my-skill" })
        .pipe(Effect.either);
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left.code).toBe("REGISTRY_REMOTE_NOT_SUPPORTED");
      }
    }).pipe(Effect.provide(NodeContext.layer)),
  );
});

// -----------------------------------------------------------------------------
// createRegistryClient factory
// -----------------------------------------------------------------------------

describe("createRegistryClient", () => {
  it.effect("creates a local client for a plain path", () => {
    const registryRoot = makeRegistryDir();
    const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(skillDir, { recursive: true });
      yield* fs.writeFileString(nodePath.join(skillDir, "index.json"), JSON.stringify(makeIndex()));

      const client = yield* createRegistryClient(registryRoot);
      const result = yield* client.getExtensions({
        ...defaultSearchOptions,
        names: ["my-skill"],
      });
      expect(result.extensions).toHaveLength(1);
      expect(result.extensions[0]!.name).toBe("my-skill");
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
      ),
      Effect.provide(NodeContext.layer),
    );
  });

  it.effect("creates a local client for a file:// URL", () => {
    const registryRoot = makeRegistryDir();
    const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(skillDir, { recursive: true });
      yield* fs.writeFileString(nodePath.join(skillDir, "index.json"), JSON.stringify(makeIndex()));

      const client = yield* createRegistryClient(`file://${registryRoot}`);
      const result = yield* client.getExtensions({
        ...defaultSearchOptions,
        names: ["my-skill"],
      });
      expect(result.extensions).toHaveLength(1);
      expect(result.extensions[0]!.name).toBe("my-skill");
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
      ),
      Effect.provide(NodeContext.layer),
    );
  });

  it.effect("creates a remote client for an https:// URL", () =>
    Effect.gen(function* () {
      const client = yield* createRegistryClient("https://registry.example.com");
      const result = yield* client.getExtensions(defaultSearchOptions).pipe(Effect.either);
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left.code).toBe("REGISTRY_REMOTE_NOT_SUPPORTED");
      }
    }).pipe(Effect.provide(NodeContext.layer)),
  );
});
