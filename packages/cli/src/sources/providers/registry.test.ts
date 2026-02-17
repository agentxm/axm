/**
 * Tests for registry source providers.
 *
 * Tests LocalRegistrySourceProvider (find, fetch, fetchIndex, fetchArchive,
 * publishVersion, checkNameExists), RemoteRegistrySourceProvider stub,
 * and createRegistryProvider factory.
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
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";

import type { ExtensionIndex, VersionEntry } from "../../registry/index.js";
import type { FindOptions } from "../provider.js";
import {
  createLocalRegistryProvider,
  createRegistryProvider,
  createRemoteRegistryProvider,
} from "./registry.js";

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

const defaultFindOptions: FindOptions = {
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
// LocalRegistrySourceProvider.find
// -----------------------------------------------------------------------------

describe("LocalRegistrySourceProvider.find", () => {
  it("returns empty when registry directory does not exist", () =>
    runEffect(
      Effect.gen(function* () {
        const provider = createLocalRegistryProvider("/nonexistent/path");
        const refs = yield* provider.find(
          {
            type: "registry",
            scope: "@test",
            extensionTypes: ["skills"],
          },
          defaultFindOptions,
        );
        expect(refs).toHaveLength(0);
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

        const provider = createLocalRegistryProvider(registryRoot);
        const refs = yield* provider.find(
          {
            type: "registry",
            scope: "@test",
            extensionTypes: ["skills"],
          },
          { ...defaultFindOptions, names: ["my-skill"] },
        );

        expect(refs).toHaveLength(1);
        expect(refs[0]!.type).toBe("skill");
        if (refs[0]!.type === "skill") {
          expect(refs[0]!.skill.name).toBe("my-skill");
          expect("version" in refs[0]! && refs[0]!.version).toBe("1.0.0");
        }
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

        const provider = createLocalRegistryProvider(registryRoot);

        const found = yield* provider.find(
          {
            type: "registry",
            scope: "@test",
            extensionTypes: ["skills"],
          },
          { ...defaultFindOptions, names: ["my-skill"], agents: ["cursor"] },
        );
        expect(found).toHaveLength(1);

        const notFound = yield* provider.find(
          {
            type: "registry",
            scope: "@test",
            extensionTypes: ["skills"],
          },
          { ...defaultFindOptions, names: ["my-skill"], agents: ["claude-code"] },
        );
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

        const provider = createLocalRegistryProvider(registryRoot);
        const refs = yield* provider.find(
          {
            type: "registry",
            scope: "@test",
            extensionTypes: ["skills"],
          },
          { ...defaultFindOptions, names: ["nonexistent"] },
        );
        expect(refs).toHaveLength(0);
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

        const provider = createLocalRegistryProvider(registryRoot);
        const refs = yield* provider.find(
          {
            type: "registry",
            scope: "@test",
            extensionTypes: ["skills"],
          },
          { ...defaultFindOptions, names: ["my-skill"] },
        );
        expect(refs).toHaveLength(0);
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });
});

// -----------------------------------------------------------------------------
// LocalRegistrySourceProvider.fetch
// -----------------------------------------------------------------------------

describe("LocalRegistrySourceProvider.fetch", () => {
  it("extracts archive and verifies checksum", () => {
    const registryRoot = makeRegistryDir();
    const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");
    const archive = createTestZip("SKILL.md", "# My Skill\nA test skill");
    const checksum = computeChecksum(archive);

    return runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillDir, { recursive: true });
        yield* fs.writeFileString(
          nodePath.join(skillDir, "index.json"),
          JSON.stringify(makeIndex({ versions: [makeVersionEntry({ checksum })] })),
        );
        yield* fs.writeFile(nodePath.join(skillDir, "1.0.0.zip"), archive);

        const provider = createLocalRegistryProvider(registryRoot);
        const result = yield* provider.fetch(
          {
            type: "registry",
            scope: "@test",
            extensionTypes: ["skills"],
          },
          {
            type: "skill",
            skill: { name: "my-skill", description: "", metadata: Option.none() },
            source: {
              type: "registry",
              scope: "@test",
              extensionTypes: ["skills"],
            },
            version: "1.0.0",
            checksum: "",
          } as never,
        );

        const extractedFile = yield* fs.readFileString(nodePath.join(result.directory, "SKILL.md"));
        expect(extractedFile).toContain("My Skill");

        yield* fs.remove(result.directory, { recursive: true });
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
        ),
      ),
    );
  });

  it("fails on checksum mismatch", () => {
    const registryRoot = makeRegistryDir();
    const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");
    const archive = createTestZip("SKILL.md", "content");

    return runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(skillDir, { recursive: true });
        yield* fs.writeFileString(
          nodePath.join(skillDir, "index.json"),
          JSON.stringify(makeIndex({ versions: [makeVersionEntry({ checksum: "sha256:wrong" })] })),
        );
        yield* fs.writeFile(nodePath.join(skillDir, "1.0.0.zip"), archive);

        const provider = createLocalRegistryProvider(registryRoot);
        const result = yield* provider
          .fetch(
            {
              type: "registry",
              scope: "@test",
              extensionTypes: ["skills"],
            },
            {
              type: "skill",
              skill: { name: "my-skill", description: "", metadata: Option.none() },
              source: {
                type: "registry",
                scope: "@test",
                extensionTypes: ["skills"],
              },
              version: "1.0.0",
              checksum: "",
            } as never,
          )
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
// LocalRegistrySourceProvider.publishVersion
// -----------------------------------------------------------------------------

describe("LocalRegistrySourceProvider.publishVersion", () => {
  it("creates new index and writes archive", () => {
    const registryRoot = makeRegistryDir();
    const archive = createTestZip("SKILL.md", "content");
    const checksum = computeChecksum(archive);
    const entry = makeVersionEntry({ checksum });

    return runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const provider = createLocalRegistryProvider(registryRoot);
        yield* provider.publishVersion("@test", "skill", "my-skill", "1.0.0", archive, entry);

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

        const provider = createLocalRegistryProvider(registryRoot);
        yield* provider.publishVersion("@test", "skill", "my-skill", "2.0.0", v2Archive, v2Entry);

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
        const provider = createLocalRegistryProvider(registryRoot);
        yield* provider.publishVersion("@test", "skill", "my-skill", "1.0.0", archive, entry);
        yield* provider.publishVersion("@test", "skill", "my-skill", "1.0.0", archive, entry);

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
        const provider = createLocalRegistryProvider(registryRoot);
        yield* provider.publishVersion("@test", "skill", "my-skill", "1.0.0", archive1, entry1);

        const result = yield* provider
          .publishVersion("@test", "skill", "my-skill", "1.0.0", archive2, entry2)
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
// RemoteRegistrySourceProvider
// -----------------------------------------------------------------------------

describe("RemoteRegistrySourceProvider", () => {
  it("fails find with descriptive error", () =>
    runEffect(
      Effect.gen(function* () {
        const provider = createRemoteRegistryProvider();
        const result = yield* provider
          .find(
            {
              type: "registry",
              scope: "@test",
              extensionTypes: ["skills"],
            },
            defaultFindOptions,
          )
          .pipe(Effect.either);
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.what).toContain("not yet supported");
        }
      }),
    ));

  it("fails fetch with descriptive error", () =>
    runEffect(
      Effect.gen(function* () {
        const provider = createRemoteRegistryProvider();
        const result = yield* provider
          .fetch(
            {
              type: "registry",
              scope: "@test",
              extensionTypes: ["skills"],
            },
            {
              type: "skill",
              skill: { name: "x", description: "", metadata: Option.none() },
              source: {
                type: "registry",
                scope: "@test",
                extensionTypes: ["skills"],
              },
              version: "1.0.0",
              checksum: "",
            } as never,
          )
          .pipe(Effect.either);
        expect(result._tag).toBe("Left");
      }),
    ));

  it("fails fetchIndex with descriptive error", () =>
    runEffect(
      Effect.gen(function* () {
        const provider = createRemoteRegistryProvider();
        const result = yield* provider.fetchIndex("@test", "skill", "x").pipe(Effect.either);
        expect(result._tag).toBe("Left");
      }),
    ));

  it("fails publishVersion with descriptive error", () =>
    runEffect(
      Effect.gen(function* () {
        const provider = createRemoteRegistryProvider();
        const result = yield* provider
          .publishVersion("@test", "skill", "x", "1.0.0", new Uint8Array(), makeVersionEntry())
          .pipe(Effect.either);
        expect(result._tag).toBe("Left");
      }),
    ));

  it("fails checkNameExists with descriptive error", () =>
    runEffect(
      Effect.gen(function* () {
        const provider = createRemoteRegistryProvider();
        const result = yield* provider.checkNameExists("@test", "skill", "x").pipe(Effect.either);
        expect(result._tag).toBe("Left");
      }),
    ));
});

// -----------------------------------------------------------------------------
// createRegistryProvider factory
// -----------------------------------------------------------------------------

describe("createRegistryProvider", () => {
  it("returns local provider for absolute path", () => {
    const provider = createRegistryProvider("/path/to/registry");
    expect(provider.type).toBe("registry");
  });

  it("returns local provider for file:// URL", () => {
    const provider = createRegistryProvider("file:///path/to/registry");
    expect(provider.type).toBe("registry");
  });

  it("returns remote stub for https:// URL", () => {
    const provider = createRegistryProvider("https://registry.example.com");
    expect(provider.type).toBe("registry");
    return runEffect(
      Effect.gen(function* () {
        const result = yield* provider
          .find(
            {
              type: "registry",
              scope: "@test",
              extensionTypes: ["skills"],
            },
            defaultFindOptions,
          )
          .pipe(Effect.either);
        expect(result._tag).toBe("Left");
      }),
    );
  });
});
