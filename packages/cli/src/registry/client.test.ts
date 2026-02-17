/**
 * Tests for LocalRegistryClient.
 *
 * Tests all 6 client methods: getExtensions, scopeExists, fetchIndex,
 * getExtension, publishExtension, extensionExists.
 */

import { createHash } from "node:crypto";
import { execSync, type ExecSyncOptions } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import type { ExtensionIndex, VersionEntry } from "./schema.js";
import type { RegistrySearchOptions } from "./client.js";
import {
  createLocalRegistryClient,
  createRegistryClient,
  createRemoteRegistryClient,
} from "./client.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const runEffect = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeContext.layer)));

const makeVersionEntry = (overrides?: Partial<VersionEntry>): VersionEntry => ({
  version: "1.0.0",
  published: "2025-01-01T00:00:00Z",
  agents: ["claude-code"],
  checksum: "sha256:0000",
  ...overrides,
});

const makeIndex = (overrides?: Partial<ExtensionIndex>): ExtensionIndex => ({
  name: "my-skill",
  scope: "@test",
  type: "skill",
  versions: [makeVersionEntry()],
  ...overrides,
});

const defaultSearchOptions: RegistrySearchOptions = {
  names: [],
  agents: [],
  type: "skill",
};

const computeChecksum = (data: Uint8Array): string => {
  const hex = createHash("sha256").update(data).digest("hex");
  return `sha256:${hex}`;
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
  it("returns empty when registry directory does not exist", () =>
    runEffect(
      Effect.gen(function* () {
        const client = createLocalRegistryClient("/nonexistent/path");
        const entries = yield* client.getExtensions(defaultSearchOptions);
        expect(entries).toHaveLength(0);
      }),
    ));

  it("finds skills by name from index.json", () => {
    const registryRoot = makeRegistryDir();
    const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");

    return runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillDir, { recursive: true });
        yield* fs.writeFileString(
          nodePath.join(skillDir, "index.json"),
          JSON.stringify(makeIndex()),
        );

        const client = createLocalRegistryClient(registryRoot);
        const entries = yield* client.getExtensions({
          ...defaultSearchOptions,
          names: ["my-skill"],
        });

        expect(entries).toHaveLength(1);
        expect(entries[0]!.type).toBe("skill");
        expect(entries[0]!.name).toBe("my-skill");
        expect(entries[0]!.version).toBe("1.0.0");
        expect(entries[0]!.scope).toBe("@test");
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });

  it("filters by agent compatibility", () => {
    const registryRoot = makeRegistryDir();
    const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");

    return runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillDir, { recursive: true });
        yield* fs.writeFileString(
          nodePath.join(skillDir, "index.json"),
          JSON.stringify(makeIndex({ versions: [makeVersionEntry({ agents: ["cursor"] })] })),
        );

        const client = createLocalRegistryClient(registryRoot);

        const found = yield* client.getExtensions({
          ...defaultSearchOptions,
          names: ["my-skill"],
          agents: ["cursor"],
        });
        expect(found).toHaveLength(1);

        const notFound = yield* client.getExtensions({
          ...defaultSearchOptions,
          names: ["my-skill"],
          agents: ["claude-code"],
        });
        expect(notFound).toHaveLength(0);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });

  it("returns empty when no matching name exists", () => {
    const registryRoot = makeRegistryDir();
    const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "other-skill");

    return runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillDir, { recursive: true });
        yield* fs.writeFileString(
          nodePath.join(skillDir, "index.json"),
          JSON.stringify(makeIndex({ name: "other-skill" })),
        );

        const client = createLocalRegistryClient(registryRoot);
        const entries = yield* client.getExtensions({
          ...defaultSearchOptions,
          names: ["nonexistent"],
        });
        expect(entries).toHaveLength(0);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });

  it("returns empty when index has no versions", () => {
    const registryRoot = makeRegistryDir();
    const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");

    return runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillDir, { recursive: true });
        yield* fs.writeFileString(
          nodePath.join(skillDir, "index.json"),
          JSON.stringify(makeIndex({ versions: [] })),
        );

        const client = createLocalRegistryClient(registryRoot);
        const entries = yield* client.getExtensions({
          ...defaultSearchOptions,
          names: ["my-skill"],
        });
        expect(entries).toHaveLength(0);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });

  it("finds all extensions when names is empty", () => {
    const registryRoot = makeRegistryDir();
    const skill1Dir = nodePath.join(registryRoot, "extensions", "@test", "skills", "skill-a");
    const skill2Dir = nodePath.join(registryRoot, "extensions", "@test", "skills", "skill-b");

    return runEffect(
      Effect.gen(function* () {
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

        const client = createLocalRegistryClient(registryRoot);
        const entries = yield* client.getExtensions(defaultSearchOptions);
        expect(entries).toHaveLength(2);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });

  it("finds mcp-server extensions", () => {
    const registryRoot = makeRegistryDir();
    const serverDir = nodePath.join(
      registryRoot,
      "extensions",
      "@test",
      "mcp-servers",
      "my-server",
    );

    return runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(serverDir, { recursive: true });
        yield* fs.writeFileString(
          nodePath.join(serverDir, "index.json"),
          JSON.stringify(makeIndex({ name: "my-server", type: "mcp-server" })),
        );

        const client = createLocalRegistryClient(registryRoot);
        const entries = yield* client.getExtensions({
          ...defaultSearchOptions,
          type: "mcp-server",
          names: ["my-server"],
        });
        expect(entries).toHaveLength(1);
        expect(entries[0]!.type).toBe("mcp-server");
        expect(entries[0]!.name).toBe("my-server");
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });
});

// -----------------------------------------------------------------------------
// LocalRegistryClient.scopeExists
// -----------------------------------------------------------------------------

describe("LocalRegistryClient.scopeExists", () => {
  it("returns true when scope directory exists", () => {
    const registryRoot = makeRegistryDir();
    const scopeDir = nodePath.join(registryRoot, "extensions", "@test", "skills");

    return runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(scopeDir, { recursive: true });

        const client = createLocalRegistryClient(registryRoot);
        const exists = yield* client.scopeExists("@test");
        expect(exists).toBe(true);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });

  it("returns false when scope directory does not exist", () => {
    const registryRoot = makeRegistryDir();

    return runEffect(
      Effect.gen(function* () {
        const client = createLocalRegistryClient(registryRoot);
        const exists = yield* client.scopeExists("@missing");
        expect(exists).toBe(false);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });
});

// -----------------------------------------------------------------------------
// LocalRegistryClient.fetchIndex
// -----------------------------------------------------------------------------

describe("LocalRegistryClient.fetchIndex", () => {
  it("reads and validates index.json", () => {
    const registryRoot = makeRegistryDir();
    const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");

    return runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillDir, { recursive: true });
        yield* fs.writeFileString(
          nodePath.join(skillDir, "index.json"),
          JSON.stringify(makeIndex()),
        );

        const client = createLocalRegistryClient(registryRoot);
        const index = yield* client.fetchIndex("@test", "skill", "my-skill");
        expect(index.name).toBe("my-skill");
        expect(index.scope).toBe("@test");
        expect(index.versions).toHaveLength(1);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });

  it("fails when index does not exist", () => {
    const registryRoot = makeRegistryDir();

    return runEffect(
      Effect.gen(function* () {
        const client = createLocalRegistryClient(registryRoot);
        const result = yield* client.fetchIndex("@test", "skill", "missing").pipe(Effect.either);
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.code).toBe("REGISTRY_FETCH_FAILED");
        }
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });
});

// -----------------------------------------------------------------------------
// LocalRegistryClient.getExtension
// -----------------------------------------------------------------------------

describe("LocalRegistryClient.getExtension", () => {
  it("reads archive bytes", () => {
    const registryRoot = makeRegistryDir();
    const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");
    const archive = createTestZip("SKILL.md", "# My Skill");

    return runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillDir, { recursive: true });
        yield* fs.writeFile(nodePath.join(skillDir, "1.0.0.zip"), archive);

        const client = createLocalRegistryClient(registryRoot);
        const bytes = yield* client.getExtension("@test", "skill", "my-skill", "1.0.0");
        expect(bytes.length).toBeGreaterThan(0);
        expect(bytes.length).toBe(archive.length);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });

  it("fails when archive does not exist", () => {
    const registryRoot = makeRegistryDir();

    return runEffect(
      Effect.gen(function* () {
        const client = createLocalRegistryClient(registryRoot);
        const result = yield* client
          .getExtension("@test", "skill", "missing", "1.0.0")
          .pipe(Effect.either);
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.code).toBe("REGISTRY_FETCH_FAILED");
        }
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });
});

// -----------------------------------------------------------------------------
// LocalRegistryClient.publishExtension
// -----------------------------------------------------------------------------

describe("LocalRegistryClient.publishExtension", () => {
  it("creates new index and writes archive", () => {
    const registryRoot = makeRegistryDir();
    const archive = createTestZip("SKILL.md", "content");
    const checksum = computeChecksum(archive);
    const entry = makeVersionEntry({ checksum });

    return runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const client = createLocalRegistryClient(registryRoot);
        yield* client.publishExtension("@test", "skill", "my-skill", "1.0.0", archive, entry);

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
      ),
    );
  });

  it("prepends new version to existing index", () => {
    const registryRoot = makeRegistryDir();
    const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");

    const v1Archive = createTestZip("SKILL.md", "v1");
    const v1Checksum = computeChecksum(v1Archive);
    const v1Entry = makeVersionEntry({ version: "1.0.0", checksum: v1Checksum });

    const v2Archive = createTestZip("SKILL.md", "v2");
    const v2Checksum = computeChecksum(v2Archive);
    const v2Entry = makeVersionEntry({ version: "2.0.0", checksum: v2Checksum });

    return runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillDir, { recursive: true });
        yield* fs.writeFileString(
          nodePath.join(skillDir, "index.json"),
          JSON.stringify(makeIndex({ versions: [v1Entry] })),
        );
        yield* fs.writeFile(nodePath.join(skillDir, "1.0.0.zip"), v1Archive);

        const client = createLocalRegistryClient(registryRoot);
        yield* client.publishExtension("@test", "skill", "my-skill", "2.0.0", v2Archive, v2Entry);

        const indexContent = yield* fs.readFileString(nodePath.join(skillDir, "index.json"));
        const index = JSON.parse(indexContent) as ExtensionIndex;
        expect(index.versions).toHaveLength(2);
        expect(index.versions[0]!.version).toBe("2.0.0");
        expect(index.versions[1]!.version).toBe("1.0.0");
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });

  it("is idempotent when same version and checksum", () => {
    const registryRoot = makeRegistryDir();
    const archive = createTestZip("SKILL.md", "content");
    const checksum = computeChecksum(archive);
    const entry = makeVersionEntry({ checksum });

    return runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const client = createLocalRegistryClient(registryRoot);
        yield* client.publishExtension("@test", "skill", "my-skill", "1.0.0", archive, entry);
        yield* client.publishExtension("@test", "skill", "my-skill", "1.0.0", archive, entry);

        const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");
        const indexContent = yield* fs.readFileString(nodePath.join(skillDir, "index.json"));
        const index = JSON.parse(indexContent) as ExtensionIndex;
        expect(index.versions).toHaveLength(1);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });

  it("fails when same version but different checksum", () => {
    const registryRoot = makeRegistryDir();
    const archive1 = createTestZip("SKILL.md", "content1");
    const checksum1 = computeChecksum(archive1);
    const entry1 = makeVersionEntry({ checksum: checksum1 });

    const archive2 = createTestZip("SKILL.md", "content2");
    const checksum2 = computeChecksum(archive2);
    const entry2 = makeVersionEntry({ checksum: checksum2 });

    return runEffect(
      Effect.gen(function* () {
        const client = createLocalRegistryClient(registryRoot);
        yield* client.publishExtension("@test", "skill", "my-skill", "1.0.0", archive1, entry1);

        const result = yield* client
          .publishExtension("@test", "skill", "my-skill", "1.0.0", archive2, entry2)
          .pipe(Effect.either);

        expect(result._tag).toBe("Left");
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });
});

// -----------------------------------------------------------------------------
// LocalRegistryClient.extensionExists
// -----------------------------------------------------------------------------

describe("LocalRegistryClient.extensionExists", () => {
  it("returns true when index.json exists", () => {
    const registryRoot = makeRegistryDir();
    const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");

    return runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillDir, { recursive: true });
        yield* fs.writeFileString(
          nodePath.join(skillDir, "index.json"),
          JSON.stringify(makeIndex()),
        );

        const client = createLocalRegistryClient(registryRoot);
        const exists = yield* client.extensionExists("@test", "skill", "my-skill");
        expect(exists).toBe(true);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });

  it("returns false when extension does not exist", () => {
    const registryRoot = makeRegistryDir();

    return runEffect(
      Effect.gen(function* () {
        const client = createLocalRegistryClient(registryRoot);
        const exists = yield* client.extensionExists("@test", "skill", "nonexistent");
        expect(exists).toBe(false);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });
});

// -----------------------------------------------------------------------------
// RemoteRegistryClient
// -----------------------------------------------------------------------------

describe("RemoteRegistryClient", () => {
  const client = createRemoteRegistryClient();

  it("getExtensions fails with remote not supported", () =>
    runEffect(
      Effect.gen(function* () {
        const result = yield* client.getExtensions(defaultSearchOptions).pipe(Effect.either);
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.code).toBe("REGISTRY_REMOTE_NOT_SUPPORTED");
          expect(result.left.what).toContain("remote registry not yet supported");
        }
      }),
    ));

  it("scopeExists fails with remote not supported", () =>
    runEffect(
      Effect.gen(function* () {
        const result = yield* client.scopeExists("@test").pipe(Effect.either);
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.code).toBe("REGISTRY_REMOTE_NOT_SUPPORTED");
        }
      }),
    ));

  it("fetchIndex fails with remote not supported", () =>
    runEffect(
      Effect.gen(function* () {
        const result = yield* client.fetchIndex("@test", "skill", "my-skill").pipe(Effect.either);
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.code).toBe("REGISTRY_REMOTE_NOT_SUPPORTED");
        }
      }),
    ));

  it("getExtension fails with remote not supported", () =>
    runEffect(
      Effect.gen(function* () {
        const result = yield* client
          .getExtension("@test", "skill", "my-skill", "1.0.0")
          .pipe(Effect.either);
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.code).toBe("REGISTRY_REMOTE_NOT_SUPPORTED");
        }
      }),
    ));

  it("publishExtension fails with remote not supported", () =>
    runEffect(
      Effect.gen(function* () {
        const result = yield* client
          .publishExtension(
            "@test",
            "skill",
            "my-skill",
            "1.0.0",
            new Uint8Array(),
            makeVersionEntry(),
          )
          .pipe(Effect.either);
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.code).toBe("REGISTRY_REMOTE_NOT_SUPPORTED");
        }
      }),
    ));

  it("extensionExists fails with remote not supported", () =>
    runEffect(
      Effect.gen(function* () {
        const result = yield* client
          .extensionExists("@test", "skill", "my-skill")
          .pipe(Effect.either);
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.code).toBe("REGISTRY_REMOTE_NOT_SUPPORTED");
        }
      }),
    ));
});

// -----------------------------------------------------------------------------
// createRegistryClient factory
// -----------------------------------------------------------------------------

describe("createRegistryClient", () => {
  it("creates a local client for a plain path", () => {
    const registryRoot = makeRegistryDir();
    const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");

    return runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillDir, { recursive: true });
        yield* fs.writeFileString(
          nodePath.join(skillDir, "index.json"),
          JSON.stringify(makeIndex()),
        );

        const client = createRegistryClient(registryRoot);
        const entries = yield* client.getExtensions({
          ...defaultSearchOptions,
          names: ["my-skill"],
        });
        expect(entries).toHaveLength(1);
        expect(entries[0]!.name).toBe("my-skill");
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });

  it("creates a local client for a file:// URL", () => {
    const registryRoot = makeRegistryDir();
    const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");

    return runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillDir, { recursive: true });
        yield* fs.writeFileString(
          nodePath.join(skillDir, "index.json"),
          JSON.stringify(makeIndex()),
        );

        const client = createRegistryClient(`file://${registryRoot}`);
        const entries = yield* client.getExtensions({
          ...defaultSearchOptions,
          names: ["my-skill"],
        });
        expect(entries).toHaveLength(1);
        expect(entries[0]!.name).toBe("my-skill");
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });

  it("creates a remote client for an https:// URL", () =>
    runEffect(
      Effect.gen(function* () {
        const client = createRegistryClient("https://registry.example.com");
        const result = yield* client.getExtensions(defaultSearchOptions).pipe(Effect.either);
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.code).toBe("REGISTRY_REMOTE_NOT_SUPPORTED");
        }
      }),
    ));
});
