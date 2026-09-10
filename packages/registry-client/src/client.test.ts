/**
 * Tests for LocalRegistryClient.
 *
 * Tests all 5 client methods: getExtensionsByScope, ownerExists,
 * getExtensionPackage, publishExtension, extensionExists.
 */

import { execSync, type ExecSyncOptions } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, layer } from "@effect/vitest";

import { computeIntegrity } from "./integrity.js";
import type {
  ExtensionIndex,
  VersionEntry,
} from "@agentxm/registry-protocol/unstable/registry/schema";
import type { GetExtensionsByOwnerArgs } from "./client.js";
import { createRegistryClient } from "./client.js";
import { createLocalRegistryClient } from "./local-client.js";
import { createRemoteRegistryClient } from "./remote-client.js";
import {
  PUBLICATION_SET_CONTRACT,
  archiveSha256Hex,
} from "@agentxm/registry-protocol/unstable/registry/publication-set";
import {
  CompanionPackageSchema,
  type CompanionPackage,
} from "@agentxm/extension-model/unstable/package-urls";
import {
  at,
  dependencyConstraints,
  exactVersion,
  extensionName,
  handle,
  packageExtensionDeclaration,
  packageType,
  versionRange,
} from "./test-helpers.js";

/** Resolve FileSystem + Path and create a local registry client in one step. */
const makeLocalClient = (registryRoot: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return createLocalRegistryClient(registryRoot, fs, path);
  });

const decodeCompanionPackage = Schema.decodeUnknownSync(CompanionPackageSchema);

const companionPackage = (purl: string): CompanionPackage => decodeCompanionPackage({ purl });

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

interface TestVersionEntryOverrides {
  readonly version?: string;
  readonly published?: DateTime.Utc;
  readonly integrity?: string;
  readonly dependencies?: Record<string, string>;
  readonly packages?: ReadonlyArray<CompanionPackage>;
}

const makeVersionEntry = (overrides?: TestVersionEntryOverrides): VersionEntry => ({
  version: exactVersion(overrides?.version ?? "1.0.0"),
  published: DateTime.makeUnsafe("2025-01-01T00:00:00Z"),
  integrity: "sha512-AAAA==",
  ...(overrides?.published === undefined ? {} : { published: overrides.published }),
  ...(overrides?.integrity === undefined ? {} : { integrity: overrides.integrity }),
  ...(overrides?.dependencies === undefined
    ? {}
    : { dependencies: dependencyConstraints(overrides.dependencies) }),
  ...(overrides?.packages === undefined ? {} : { packages: overrides.packages }),
});

interface TestIndexOverrides {
  readonly name?: string;
  readonly owner?: string;
  readonly type?: ExtensionIndex["type"];
  readonly publisherBindingId?: string;
  readonly description?: string;
  readonly repository?: string;
  readonly license?: string;
  readonly authors?: ExtensionIndex["authors"];
  readonly versions?: ReadonlyArray<VersionEntry>;
}

const makeIndex = (overrides?: TestIndexOverrides): ExtensionIndex => ({
  name: extensionName(overrides?.name ?? "my-skill"),
  owner: handle(overrides?.owner ?? "@test"),
  type: "skill",
  publisherBindingId: overrides?.publisherBindingId ?? "hbnd_test",
  deprecation: null,
  versions: overrides?.versions ?? [makeVersionEntry()],
  ...(overrides?.type === undefined ? {} : { type: overrides.type }),
  ...(overrides?.description === undefined ? {} : { description: overrides.description }),
  ...(overrides?.repository === undefined ? {} : { repository: overrides.repository }),
  ...(overrides?.license === undefined ? {} : { license: overrides.license }),
  ...(overrides?.authors === undefined ? {} : { authors: overrides.authors }),
});

const defaultSearchOptions: GetExtensionsByOwnerArgs = {
  owner: handle("@test"),
  names: [],
  types: ["skill"],
  limit: Option.none(),
  offset: 0,
};

const makeIndexArgs = (name = "my-skill", owner = "@test") => ({
  owner: handle(owner),
  type: "skill" as const,
  name: extensionName(name),
});

const noVisibilityInput = { intent: null, request: null } as const;
const privateVisibilityInput = { intent: null, request: "private" } as const;
const publicVisibilityInput = { intent: null, request: "public" } as const;
const establishPrivateVisibility = {
  value: "private",
  disposition: "establish",
  source: "explicit",
} as const;

const makePackageVersion = (value: string) =>
  /[\^~*<>\s]/.test(value) ? versionRange(value) : exactVersion(value);

const makePackageArgs = (name = "my-skill", version?: string, owner = "@test") => ({
  ...makeIndexArgs(name, owner),
  version: version === undefined ? Option.none() : Option.some(makePackageVersion(version)),
});

const makeExistsArgs = (name = "my-skill", owner = "@test") => makeIndexArgs(name, owner);

const makeDetectedPackage = (type: string, name: string) => ({
  type: packageType(type),
  name,
});

const makePublishArgs = (
  archive: Uint8Array,
  metadata: VersionEntry,
  version = "1.0.0",
  name = "my-skill",
  owner = "@test",
) => ({
  owner: handle(owner),
  type: "skill" as const,
  name: extensionName(name),
  version: exactVersion(version),
  archive,
  metadata,
  visibilityInput: { intent: null, request: null },
});

const makeRemotePublishArgs = (
  archive: Uint8Array,
  metadata: VersionEntry,
  version = "1.0.0",
  name = "my-skill",
  owner = "@test",
) => ({
  ...makePublishArgs(archive, metadata, version, name, owner),
  condition: '"pv2-test"',
  publicationSetDigest: archiveSha256Hex(new TextEncoder().encode("publication-set")),
  publicationDescriptorDigest: archiveSha256Hex(new TextEncoder().encode("publication-descriptor")),
});

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

const remoteHttpLayer = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify({ extensions: [], total: 0 }), { status: 200 }),
      ),
    ),
  ),
);

// -----------------------------------------------------------------------------
// LocalRegistryClient.getExtensionsByScope
// -----------------------------------------------------------------------------

layer(Layer.merge(NodeServices.layer, FetchHttpClient.layer), { excludeTestServices: true })(
  (it) => {
    describe("LocalRegistryClient.getExtensionsByScope", () => {
      it.effect("returns empty when registry directory does not exist", () =>
        Effect.gen(function* () {
          const client = yield* makeLocalClient("/nonexistent/path");
          const result = yield* client.getExtensionsByScope(defaultSearchOptions);
          expect(result.extensions).toHaveLength(0);
          expect(result.total).toBe(0);
        }),
      );

      it.effect("finds skills by name from index.json", () => {
        const registryRoot = makeRegistryDir();
        const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(skillDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(skillDir, "index.json"),
            JSON.stringify(makeIndex()),
          );

          const client = yield* makeLocalClient(registryRoot);
          const result = yield* client.getExtensionsByScope({
            ...defaultSearchOptions,
            names: ["my-skill"],
          });

          expect(result.extensions).toHaveLength(1);
          expect(at(result.extensions, 0).type).toBe("skill");
          expect(at(result.extensions, 0).name).toBe("my-skill");
          expect(at(result.extensions, 0).version).toBe("1.0.0");
          expect(at(result.extensions, 0).owner).toBe("@test");
          expect(result.total).toBe(1);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect("returns empty when no matching name exists", () => {
        const registryRoot = makeRegistryDir();
        const skillDir = nodePath.join(
          registryRoot,
          "extensions",
          "@test",
          "skills",
          "other-skill",
        );

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(skillDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(skillDir, "index.json"),
            JSON.stringify(makeIndex({ name: "other-skill" })),
          );

          const client = yield* makeLocalClient(registryRoot);
          const result = yield* client.getExtensionsByScope({
            ...defaultSearchOptions,
            names: ["nonexistent"],
          });
          expect(result.extensions).toHaveLength(0);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
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
          const result = yield* client.getExtensionsByScope({
            ...defaultSearchOptions,
            names: ["my-skill"],
          });
          expect(result.extensions).toHaveLength(0);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
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
          const result = yield* client.getExtensionsByScope(defaultSearchOptions);
          expect(result.extensions).toHaveLength(2);
          expect(result.total).toBe(2);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect("filters by owner when owner is provided", () => {
        const registryRoot = makeRegistryDir();
        const scopedSkillDir = nodePath.join(
          registryRoot,
          "extensions",
          "@test",
          "skills",
          "skill-a",
        );
        const otherSkillDir = nodePath.join(
          registryRoot,
          "extensions",
          "@other",
          "skills",
          "skill-a",
        );

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(scopedSkillDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(scopedSkillDir, "index.json"),
            JSON.stringify(makeIndex({ owner: "@test", name: "skill-a" })),
          );
          yield* fs.makeDirectory(otherSkillDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(otherSkillDir, "index.json"),
            JSON.stringify(makeIndex({ owner: "@other", name: "skill-a" })),
          );

          const client = yield* makeLocalClient(registryRoot);
          const result = yield* client.getExtensionsByScope({
            ...defaultSearchOptions,
            owner: handle("@test"),
            names: ["skill-a"],
          });

          expect(result.extensions).toHaveLength(1);
          expect(at(result.extensions, 0).owner).toBe("@test");
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect("finds mcp-server extensions", () => {
        const registryRoot = makeRegistryDir();
        const serverDir = nodePath.join(registryRoot, "extensions", "@test", "mcps", "my-server");

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(serverDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(serverDir, "index.json"),
            JSON.stringify(makeIndex({ name: "my-server", type: "mcp-server" })),
          );

          const client = yield* makeLocalClient(registryRoot);
          const result = yield* client.getExtensionsByScope({
            ...defaultSearchOptions,
            types: ["mcp-server"],
            names: ["my-server"],
          });
          expect(result.extensions).toHaveLength(1);
          expect(at(result.extensions, 0).type).toBe("mcp-server");
          expect(at(result.extensions, 0).name).toBe("my-server");
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
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
          const page1 = yield* client.getExtensionsByScope({
            ...defaultSearchOptions,
            limit: Option.some(2),
            offset: 0,
          });
          expect(page1.extensions).toHaveLength(2);
          expect(page1.total).toBe(3);

          // limit=2, offset=2 → last 1
          const page2 = yield* client.getExtensionsByScope({
            ...defaultSearchOptions,
            limit: Option.some(2),
            offset: 2,
          });
          expect(page2.extensions).toHaveLength(1);
          expect(page2.total).toBe(3);

          // no limit, offset=1 → skip 1
          const page3 = yield* client.getExtensionsByScope({
            ...defaultSearchOptions,
            limit: Option.none(),
            offset: 1,
          });
          expect(page3.extensions).toHaveLength(2);
          expect(page3.total).toBe(3);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });
    });

    // -----------------------------------------------------------------------------
    // LocalRegistryClient.ownerExists
    // -----------------------------------------------------------------------------

    describe("LocalRegistryClient.ownerExists", () => {
      it.effect("returns true when owner directory exists", () => {
        const registryRoot = makeRegistryDir();
        const scopeDir = nodePath.join(registryRoot, "extensions", "@test", "skills");

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(scopeDir, { recursive: true });

          const client = yield* makeLocalClient(registryRoot);
          const result = yield* client.ownerExists(handle("@test"));
          expect(result.exists).toBe(true);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect("returns false when owner directory does not exist", () => {
        const registryRoot = makeRegistryDir();

        return Effect.gen(function* () {
          const client = yield* makeLocalClient(registryRoot);
          const result = yield* client.ownerExists(handle("@missing"));
          expect(result.exists).toBe(false);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });
    });

    // -----------------------------------------------------------------------------
    // LocalRegistryClient.getExtensionPackage
    // -----------------------------------------------------------------------------

    describe("LocalRegistryClient.getExtensionPackage", () => {
      it.effect("reads archive bytes for explicit version", () => {
        const registryRoot = makeRegistryDir();
        const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");
        const archive = createTestZip("SKILL.md", "# My Skill");

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(skillDir, { recursive: true });
          yield* fs.writeFile(nodePath.join(skillDir, "1.0.0.zip"), archive);

          const client = yield* makeLocalClient(registryRoot);
          const { archive: bytes } = yield* client.getExtensionPackage(
            makePackageArgs("my-skill", "1.0.0"),
          );
          expect(bytes.length).toBeGreaterThan(0);
          expect(bytes.length).toBe(archive.length);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
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
          const { archive: bytes } = yield* client.getExtensionPackage(makePackageArgs());
          expect(bytes.length).toBeGreaterThan(0);
          expect(bytes.length).toBe(archive.length);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect("resolves archive from semver range constraint", () => {
        const registryRoot = makeRegistryDir();
        const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");
        const archiveV015 = createTestZip("SKILL.md", "# My Skill v0.1.5");
        const archiveV020 = createTestZip("SKILL.md", "# My Skill v0.2.0");

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(skillDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(skillDir, "index.json"),
            JSON.stringify(
              makeIndex({
                versions: [
                  makeVersionEntry({ version: "0.2.0" }),
                  makeVersionEntry({ version: "0.1.5" }),
                ],
              }),
            ),
          );
          yield* fs.writeFile(nodePath.join(skillDir, "0.1.5.zip"), archiveV015);
          yield* fs.writeFile(nodePath.join(skillDir, "0.2.0.zip"), archiveV020);

          const client = yield* makeLocalClient(registryRoot);
          const { archive: bytes } = yield* client.getExtensionPackage(
            makePackageArgs("my-skill", "^0.1.0"),
          );

          expect(bytes.length).toBe(archiveV015.length);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect("fails when archive does not exist", () => {
        const registryRoot = makeRegistryDir();

        return Effect.gen(function* () {
          const client = yield* makeLocalClient(registryRoot);
          const result = yield* client
            .getExtensionPackage(makePackageArgs("missing", "1.0.0"))
            .pipe(Effect.result);
          expect(result._tag).toBe("Failure");
          if (result._tag === "Failure") {
            expect(result.failure.category).toBe("internal");
          }
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
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
          const result = yield* client.getExtensionPackage(makePackageArgs()).pipe(Effect.result);
          expect(result._tag).toBe("Failure");
          if (result._tag === "Failure") {
            expect(result.failure.category).toBe("internal");
          }
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });
    });

    // -----------------------------------------------------------------------------
    // LocalRegistryClient.previewExtensionPublishes
    // -----------------------------------------------------------------------------

    describe("LocalRegistryClient.previewExtensionPublishes", () => {
      it.effect("resolves omitted visibility to the local platform default", () => {
        const registryRoot = makeRegistryDir();
        return Effect.gen(function* () {
          const client = yield* makeLocalClient(registryRoot);
          const preview = yield* client.previewExtensionPublishes({
            contract: PUBLICATION_SET_CONTRACT,
            candidates: [
              {
                target: { ...makeIndexArgs(), version: exactVersion("1.0.0") },
                participation: "publish",
                archiveSha256Hex: archiveSha256Hex(new Uint8Array([1])),
                visibility: noVisibilityInput,
              },
            ],
          });
          const result = preview.candidates[0];

          expect(result?.kind).toBe("resolved");
          if (result?.kind === "resolved") {
            expect(result.visibility.resolved?.value).toBe("public");
            expect(result.condition).toMatch(/^"pv1-[0-9a-f]{64}"$/);
          }
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect("preserves existing visibility when an override is requested", () => {
        const registryRoot = makeRegistryDir();
        const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");
        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(skillDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(skillDir, "index.json"),
            JSON.stringify({ ...makeIndex(), visibility: "private" }),
          );
          const client = yield* makeLocalClient(registryRoot);

          const preview = yield* client.previewExtensionPublishes({
            contract: PUBLICATION_SET_CONTRACT,
            candidates: [
              {
                target: { ...makeIndexArgs(), version: exactVersion("2.0.0") },
                participation: "publish",
                archiveSha256Hex: archiveSha256Hex(new Uint8Array([1])),
                visibility: publicVisibilityInput,
              },
            ],
          });
          const result = preview.candidates[0];

          expect(result?.kind).toBe("resolved");
          if (result?.kind === "resolved") {
            expect(result.visibility.resolved?.value).toBe("private");
          }
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });
    });

    // -----------------------------------------------------------------------------
    // LocalRegistryClient.publishExtension
    // -----------------------------------------------------------------------------

    describe("LocalRegistryClient.publishExtension", () => {
      it.effect("validates the preview condition and returns authoritative visibility", () => {
        const registryRoot = makeRegistryDir();
        const archive = createTestZip("SKILL.md", "conditioned content");

        return Effect.gen(function* () {
          const integrity = yield* computeIntegrity(archive);
          const entry = makeVersionEntry({ integrity });
          const client = yield* makeLocalClient(registryRoot);
          const previewResponse = yield* client.previewExtensionPublishes({
            contract: PUBLICATION_SET_CONTRACT,
            candidates: [
              {
                target: { ...makeIndexArgs(), version: exactVersion("1.0.0") },
                participation: "publish",
                archiveSha256Hex: archiveSha256Hex(archive),
                visibility: privateVisibilityInput,
              },
            ],
          });
          const preview = previewResponse.candidates[0];
          if (preview?.kind !== "resolved" || preview.condition === undefined) return;

          const result = yield* client.publishExtension({
            ...makePublishArgs(archive, entry),
            visibility: establishPrivateVisibility,
            condition: preview.condition,
            publicationSetDigest: previewResponse.publicationSetDigest,
            publicationDescriptorDigest: preview.descriptorDigest,
          });

          expect(result.visibility.value).toBe(preview.visibility.resolved?.value);
          expect(result.integrity).toBe(integrity);
          expect(result.status).toBe("available");
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect("rejects a stale preview condition before writing", () => {
        const registryRoot = makeRegistryDir();
        const archive = createTestZip("SKILL.md", "stale content");
        const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const integrity = yield* computeIntegrity(archive);
          const entry = makeVersionEntry({ integrity });
          const client = yield* makeLocalClient(registryRoot);
          const previewResponse = yield* client.previewExtensionPublishes({
            contract: PUBLICATION_SET_CONTRACT,
            candidates: [
              {
                target: { ...makeIndexArgs(), version: exactVersion("1.0.0") },
                participation: "publish",
                archiveSha256Hex: archiveSha256Hex(archive),
                visibility: noVisibilityInput,
              },
            ],
          });
          const preview = previewResponse.candidates[0];
          if (preview?.kind !== "resolved" || preview.condition === undefined) return;
          yield* fs.makeDirectory(skillDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(skillDir, "index.json"),
            JSON.stringify({ ...makeIndex(), visibility: "private" }),
          );

          const result = yield* client
            .publishExtension({
              ...makePublishArgs(archive, entry),
              condition: preview.condition,
              publicationSetDigest: previewResponse.publicationSetDigest,
              publicationDescriptorDigest: preview.descriptorDigest,
            })
            .pipe(Effect.result);

          expect(result._tag).toBe("Failure");
          if (result._tag === "Failure") expect(result.failure.category).toBe("conflict");
          expect(yield* fs.exists(nodePath.join(skillDir, "1.0.0.zip"))).toBe(false);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect("creates new index and writes archive", () => {
        const registryRoot = makeRegistryDir();
        const archive = createTestZip("SKILL.md", "content");

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const integrity = yield* computeIntegrity(archive);
          const entry = makeVersionEntry({ integrity });
          const client = yield* makeLocalClient(registryRoot);
          yield* client.publishExtension(makePublishArgs(archive, entry));

          const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");
          const indexContent = yield* fs.readFileString(nodePath.join(skillDir, "index.json"));
          const index: ExtensionIndex = JSON.parse(indexContent);
          expect(index.name).toBe("my-skill");
          expect(index.owner).toBe("@test");
          expect(index.visibility).toBe("public");
          expect(index.versions).toHaveLength(1);
          expect(at(index.versions, 0).version).toBe("1.0.0");

          const archiveExists = yield* fs.exists(nodePath.join(skillDir, "1.0.0.zip"));
          expect(archiveExists).toBe(true);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect("creates a private index in the publish operation", () => {
        const registryRoot = makeRegistryDir();
        const archive = createTestZip("SKILL.md", "private content");

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const integrity = yield* computeIntegrity(archive);
          const entry = makeVersionEntry({ integrity });
          const client = yield* makeLocalClient(registryRoot);
          yield* client.publishExtension({
            ...makePublishArgs(archive, entry),
            visibility: establishPrivateVisibility,
          });

          const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");
          const indexContent = yield* fs.readFileString(nodePath.join(skillDir, "index.json"));
          const index: ExtensionIndex = JSON.parse(indexContent);
          expect(index.visibility).toBe("private");
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect(
        "rejects initial visibility for an existing extension before writing the archive",
        () => {
          const registryRoot = makeRegistryDir();
          const v1Archive = createTestZip("SKILL.md", "v1");
          const v2Archive = createTestZip("SKILL.md", "v2");

          return Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;
            const client = yield* makeLocalClient(registryRoot);
            const v1Integrity = yield* computeIntegrity(v1Archive);
            const v2Integrity = yield* computeIntegrity(v2Archive);
            yield* client.publishExtension(
              makePublishArgs(v1Archive, makeVersionEntry({ integrity: v1Integrity })),
            );

            const result = yield* client
              .publishExtension({
                ...makePublishArgs(
                  v2Archive,
                  makeVersionEntry({ version: "2.0.0", integrity: v2Integrity }),
                  "2.0.0",
                ),
                visibility: establishPrivateVisibility,
              })
              .pipe(Effect.result);

            expect(result._tag).toBe("Failure");
            if (result._tag === "Failure") {
              expect(result.failure.category).toBe("conflict");
            }
            const skillDir = nodePath.join(
              registryRoot,
              "extensions",
              "@test",
              "skills",
              "my-skill",
            );
            expect(yield* fs.exists(nodePath.join(skillDir, "2.0.0.zip"))).toBe(false);
          }).pipe(
            Effect.ensuring(
              Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
            ),
          );
        },
      );

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
          yield* client.publishExtension(makePublishArgs(v2Archive, v2Entry, "2.0.0"));

          const indexContent = yield* fs.readFileString(nodePath.join(skillDir, "index.json"));
          const index: ExtensionIndex = JSON.parse(indexContent);
          expect(index.versions).toHaveLength(2);
          expect(at(index.versions, 0).version).toBe("2.0.0");
          expect(at(index.versions, 1).version).toBe("1.0.0");
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect("does not publish index metadata when the archive cannot be committed", () => {
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
          yield* fs.makeDirectory(nodePath.join(skillDir, "2.0.0.zip"));

          const client = yield* makeLocalClient(registryRoot);
          const result = yield* client
            .publishExtension(makePublishArgs(v2Archive, v2Entry, "2.0.0"))
            .pipe(Effect.result);

          expect(result._tag).toBe("Failure");
          const indexContent = yield* fs.readFileString(nodePath.join(skillDir, "index.json"));
          const index: ExtensionIndex = JSON.parse(indexContent);
          expect(index.versions.map((version) => version.version)).toEqual(["1.0.0"]);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect("serializes concurrent publishes for the same extension", () => {
        const registryRoot = makeRegistryDir();
        const archives = [
          createTestZip("SKILL.md", "v1"),
          createTestZip("SKILL.md", "v2"),
          createTestZip("SKILL.md", "v3"),
        ];

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const client = yield* makeLocalClient(registryRoot);
          const integrities = yield* Effect.forEach(archives, computeIntegrity);
          const versions = ["1.0.0", "2.0.0", "3.0.0"] as const;
          yield* Effect.forEach(
            versions,
            (version, index) => {
              const archive = archives[index];
              const integrity = integrities[index];
              if (archive === undefined || integrity === undefined) {
                return Effect.die("Expected publish fixture");
              }
              return client.publishExtension(
                makePublishArgs(archive, makeVersionEntry({ version, integrity }), version),
              );
            },
            { concurrency: "unbounded" },
          );

          const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");
          const indexContent = yield* fs.readFileString(nodePath.join(skillDir, "index.json"));
          const index: ExtensionIndex = JSON.parse(indexContent);
          expect(index.versions.map((version) => version.version).sort()).toEqual([...versions]);
          expect(
            yield* Effect.forEach(versions, (version) =>
              fs.exists(nodePath.join(skillDir, `${version}.zip`)),
            ),
          ).toEqual([true, true, true]);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect("fails when same version has the same integrity", () => {
        const registryRoot = makeRegistryDir();
        const archive = createTestZip("SKILL.md", "content");

        return Effect.gen(function* () {
          const integrity = yield* computeIntegrity(archive);
          const entry = makeVersionEntry({ integrity });
          const client = yield* makeLocalClient(registryRoot);
          const publishArgs = makePublishArgs(archive, entry) satisfies Parameters<
            typeof client.publishExtension
          >[0];
          yield* client.publishExtension(publishArgs);

          const result = yield* client.publishExtension(publishArgs).pipe(Effect.result);

          expect(result._tag).toBe("Failure");
          if (result._tag === "Failure") {
            expect(result.failure.category).toBe("conflict");
          }
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
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
          yield* client.publishExtension(makePublishArgs(archive1, entry1));

          const result = yield* client
            .publishExtension(makePublishArgs(archive2, entry2))
            .pipe(Effect.result);

          expect(result._tag).toBe("Failure");
          if (result._tag === "Failure") {
            expect(result.failure.category).toBe("conflict");
          }
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
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
          yield* fs.writeFileString(
            nodePath.join(skillDir, "index.json"),
            JSON.stringify(makeIndex()),
          );

          const client = yield* makeLocalClient(registryRoot);
          const result = yield* client.extensionExists(makeExistsArgs());
          expect(result.exists).toBe(true);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect("returns false when extension does not exist", () => {
        const registryRoot = makeRegistryDir();

        return Effect.gen(function* () {
          const client = yield* makeLocalClient(registryRoot);
          const result = yield* client.extensionExists(makeExistsArgs("nonexistent"));
          expect(result.exists).toBe(false);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });
    });

    // -----------------------------------------------------------------------------
    // LocalRegistryClient.discoverPackages
    // -----------------------------------------------------------------------------

    describe("LocalRegistryClient.discoverPackages", () => {
      /** Helper to create an index with packages on the latest version. */
      const makeCompatibleIndex = (
        overrides: TestIndexOverrides & {
          packages?: ReadonlyArray<CompanionPackage>;
        },
      ): ExtensionIndex => {
        const { packages, ...rest } = overrides;
        return makeIndex({
          ...rest,
          versions: [
            makeVersionEntry({
              ...(packages ? { packages } : {}),
            }),
          ],
        });
      };

      it.effect("packages only — returns extensions matching provided purls", () => {
        const registryRoot = makeRegistryDir();
        const skillDir = nodePath.join(
          registryRoot,
          "extensions",
          "@test",
          "skills",
          "react-skill",
        );

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(skillDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(skillDir, "index.json"),
            JSON.stringify(
              makeCompatibleIndex({
                name: "react-skill",
                description: "React support",
                packages: [companionPackage("pkg:npm/react")],
              }),
            ),
          );

          const client = yield* makeLocalClient(registryRoot);
          const result = yield* client.discoverPackages({
            packages: [
              {
                purl: makeDetectedPackage("npm", "react"),
                version: "18.2.0",
                declaredExtensions: [],
              },
            ],
          });

          expect(result.results).toHaveLength(1);
          expect(at(result.results, 0).purl).toBe("pkg:npm/react");
          expect(at(result.results, 0).extensions).toHaveLength(1);
          expect(at(at(result.results, 0).extensions, 0).extension?.name).toBe("react-skill");
          expect(at(at(result.results, 0).extensions, 0).attestedBy).toEqual(["extension"]);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect("package and extension attestations produce official result", () => {
        const registryRoot = makeRegistryDir();
        const nextSkillDir = nodePath.join(
          registryRoot,
          "extensions",
          "@vercel",
          "skills",
          "nextjs",
        );

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(nextSkillDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(nextSkillDir, "index.json"),
            JSON.stringify(
              makeCompatibleIndex({
                owner: "@vercel",
                name: "nextjs",
                description: "Next.js support",
                packages: [companionPackage("pkg:npm/next")],
              }),
            ),
          );

          const client = yield* makeLocalClient(registryRoot);
          const result = yield* client.discoverPackages({
            packages: [
              {
                purl: makeDetectedPackage("npm", "next"),
                version: "14.0.0",
                declaredExtensions: [
                  packageExtensionDeclaration({
                    ref: "@vercel/skills/nextjs",
                    versionRange: "^1.0.0",
                  }),
                ],
              },
            ],
          });

          expect(result.results).toHaveLength(1);
          expect(at(result.results, 0).extensions).toHaveLength(1);
          expect(at(at(result.results, 0).extensions, 0).official).toBe(true);
          expect(at(at(result.results, 0).extensions, 0).attestedBy).toEqual([
            "package",
            "extension",
          ]);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect("extension matches multiple packages — appears in both groups", () => {
        const registryRoot = makeRegistryDir();
        const skillDir = nodePath.join(registryRoot, "extensions", "@acme", "skills", "fullstack");

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(skillDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(skillDir, "index.json"),
            JSON.stringify(
              makeCompatibleIndex({
                owner: "@acme",
                name: "fullstack",
                description: "Full stack support",
                packages: [companionPackage("pkg:npm/react"), companionPackage("pkg:npm/next")],
              }),
            ),
          );

          const client = yield* makeLocalClient(registryRoot);
          const result = yield* client.discoverPackages({
            packages: [
              {
                purl: makeDetectedPackage("npm", "react"),
                version: "18.2.0",
                declaredExtensions: [],
              },
              {
                purl: makeDetectedPackage("npm", "next"),
                version: "14.0.0",
                declaredExtensions: [],
              },
            ],
          });

          expect(result.results).toHaveLength(2);

          const reactGroup = result.results.find((r) => r.purl === "pkg:npm/react");
          const nextGroup = result.results.find((r) => r.purl === "pkg:npm/next");

          expect(reactGroup).toBeDefined();
          expect(reactGroup?.extensions).toHaveLength(1);
          expect(at(reactGroup?.extensions ?? [], 0).extension?.name).toBe("fullstack");

          expect(nextGroup).toBeDefined();
          expect(nextGroup?.extensions).toHaveLength(1);
          expect(at(nextGroup?.extensions ?? [], 0).extension?.name).toBe("fullstack");
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect("package with no matches — omitted from results", () => {
        const registryRoot = makeRegistryDir();
        const skillDir = nodePath.join(
          registryRoot,
          "extensions",
          "@test",
          "skills",
          "react-skill",
        );

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(skillDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(skillDir, "index.json"),
            JSON.stringify(
              makeCompatibleIndex({
                name: "react-skill",
                description: "React support",
                packages: [companionPackage("pkg:npm/react")],
              }),
            ),
          );

          const client = yield* makeLocalClient(registryRoot);
          const result = yield* client.discoverPackages({
            packages: [
              {
                purl: makeDetectedPackage("npm", "obscure-lib"),
                version: "1.0.0",
                declaredExtensions: [],
              },
            ],
          });

          expect(result.results).toHaveLength(1);
          expect(at(result.results, 0).extensions).toHaveLength(0);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect("package-only declarations resolve when the extension exists", () => {
        const registryRoot = makeRegistryDir();
        const skillDir = nodePath.join(registryRoot, "extensions", "@vercel", "skills", "nextjs");

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(skillDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(skillDir, "index.json"),
            JSON.stringify(
              makeCompatibleIndex({
                owner: "@vercel",
                name: "nextjs",
                description: "Next.js support",
              }),
            ),
          );

          const client = yield* makeLocalClient(registryRoot);
          const result = yield* client.discoverPackages({
            packages: [
              {
                purl: makeDetectedPackage("npm", "next"),
                version: "14.0.0",
                declaredExtensions: [
                  packageExtensionDeclaration({
                    ref: "@vercel/skills/nextjs",
                    versionRange: "^1.0.0",
                  }),
                ],
              },
            ],
          });

          const rec = at(at(result.results, 0).extensions, 0);
          expect(rec.extension?.type).toBe("skill");
          expect(rec.extension?.name).toBe("nextjs");
          expect(rec.extension?.owner).toBe("@vercel");
          expect(rec.attestedBy).toEqual(["package"]);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect("unknown refs are returned unresolved", () => {
        const registryRoot = makeRegistryDir();

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(nodePath.join(registryRoot, "extensions"), { recursive: true });

          const client = yield* makeLocalClient(registryRoot);
          const result = yield* client.discoverPackages({
            packages: [
              {
                purl: makeDetectedPackage("npm", "unknown"),
                version: "1.0.0",
                declaredExtensions: [
                  packageExtensionDeclaration({
                    ref: "@unknown/skills/nonexistent",
                    versionRange: "^1.0.0",
                  }),
                ],
              },
            ],
          });

          const entry = at(at(result.results, 0).extensions, 0);
          expect(entry.resolved).toBe(false);
          expect(entry.ref).toBe("@unknown/skills/nonexistent");
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect("no published extensions — empty results", () => {
        const registryRoot = makeRegistryDir();

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(nodePath.join(registryRoot, "extensions"), { recursive: true });

          const client = yield* makeLocalClient(registryRoot);
          const result = yield* client.discoverPackages({
            packages: [
              {
                purl: makeDetectedPackage("npm", "react"),
                version: "18.2.0",
                declaredExtensions: [],
              },
            ],
          });

          expect(result.results).toHaveLength(1);
          expect(at(result.results, 0).extensions).toHaveLength(0);
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect("entry contains required fields", () => {
        const registryRoot = makeRegistryDir();
        const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(skillDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(skillDir, "index.json"),
            JSON.stringify(
              makeCompatibleIndex({
                name: "my-skill",
                description: "A test skill",
                packages: [companionPackage("pkg:npm/react")],
              }),
            ),
          );

          const client = yield* makeLocalClient(registryRoot);
          const result = yield* client.discoverPackages({
            packages: [
              {
                purl: makeDetectedPackage("npm", "react"),
                version: "18.2.0",
                declaredExtensions: [],
              },
            ],
          });

          const entry = at(at(result.results, 0).extensions, 0);
          expect(entry.extension?.type).toBe("skill");
          expect(entry.extension?.name).toBe("my-skill");
          expect(entry.extension?.owner).toBe("@test");
          expect(entry.extension?.installVersion).toBe("1.0.0");
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect(
        "discover returns individual extensions not packs when extension belongs to a pack",
        () => {
          const registryRoot = makeRegistryDir();
          const skillDir = nodePath.join(
            registryRoot,
            "extensions",
            "@acme",
            "skills",
            "react-testing",
          );
          const packDir = nodePath.join(registryRoot, "extensions", "@acme", "packs", "frontend");

          return Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem;

            // Create a skill with packages
            yield* fs.makeDirectory(skillDir, { recursive: true });
            yield* fs.writeFileString(
              nodePath.join(skillDir, "index.json"),
              JSON.stringify(
                makeCompatibleIndex({
                  owner: "@acme",
                  name: "react-testing",
                  description: "React testing support",
                  packages: [companionPackage("pkg:npm/react")],
                }),
              ),
            );

            // Create a pack that includes the skill (packs do not declare packages)
            yield* fs.makeDirectory(packDir, { recursive: true });
            yield* fs.writeFileString(
              nodePath.join(packDir, "index.json"),
              JSON.stringify(
                makeIndex({
                  owner: "@acme",
                  name: "frontend",
                  type: "pack",
                  versions: [
                    makeVersionEntry({
                      dependencies: { "@acme/skills/react-testing": "^1.0.0" },
                    }),
                  ],
                }),
              ),
            );

            const client = yield* makeLocalClient(registryRoot);
            const result = yield* client.discoverPackages({
              packages: [
                {
                  purl: makeDetectedPackage("npm", "react"),
                  version: "18.2.0",
                  declaredExtensions: [],
                },
              ],
            });

            // The individual skill appears, not the pack
            expect(result.results).toHaveLength(1);
            const matchGroup = at(result.results, 0);
            expect(matchGroup.extensions).toHaveLength(1);
            expect(at(matchGroup.extensions, 0).extension?.name).toBe("react-testing");
            expect(at(matchGroup.extensions, 0).extension?.type).toBe("skill");
            // No pack reference in results
            const allNames = matchGroup.extensions.map((e) => e.extension?.name);
            expect(allNames).not.toContain("frontend");
          }).pipe(
            Effect.ensuring(
              Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
            ),
          );
        },
      );
    });

    // -----------------------------------------------------------------------------
    // RemoteRegistryClient
    // -----------------------------------------------------------------------------

    describe("RemoteRegistryClient", () => {
      const stubHttpClient = HttpClient.make((request) =>
        Effect.sync(() => {
          if (request.url.endsWith("/v1/owners/@test")) {
            return HttpClientResponse.fromWeb(
              request,
              new Response(JSON.stringify({ displayName: "Test Owner" }), { status: 200 }),
            );
          }

          if (request.url.endsWith("/v1/extensions/@test")) {
            return HttpClientResponse.fromWeb(
              request,
              new Response(
                JSON.stringify({
                  extensions: [
                    {
                      owner: "@test",
                      type: "skill",
                      name: "my-skill",
                      latestVersion: "1.0.0",
                      deprecation: null,
                    },
                  ],
                  total: 1,
                }),
                { status: 200 },
              ),
            );
          }

          if (request.url.endsWith("/v1/extensions/@test/skills")) {
            return HttpClientResponse.fromWeb(
              request,
              new Response(
                JSON.stringify({
                  extensions: [
                    {
                      owner: "@test",
                      type: "skill",
                      name: "my-skill",
                      latestVersion: "1.0.0",
                      deprecation: null,
                    },
                  ],
                  total: 1,
                }),
                { status: 200 },
              ),
            );
          }

          if (request.url.endsWith("/v1/extensions/@test/skills/my-skill")) {
            // HEAD requests for extensionExists
            if (request.method === "HEAD") {
              return HttpClientResponse.fromWeb(request, new Response(null, { status: 200 }));
            }
            return HttpClientResponse.fromWeb(
              request,
              new Response(
                JSON.stringify({
                  owner: "@test",
                  type: "skill",
                  name: "my-skill",
                  publisher_binding_id: "hbnd_test",
                  deprecation: null,
                  versions: [
                    {
                      version: "1.0.0",
                      published: DateTime.makeUnsafe("2025-01-01T00:00:00Z"),
                      integrity: "sha512-AAAA==",
                    },
                  ],
                }),
                { status: 200 },
              ),
            );
          }

          if (request.url.endsWith("/v1/extensions/@test/skills/my-skill/1.0.0/archive")) {
            return HttpClientResponse.fromWeb(
              request,
              new Response(new Uint8Array([0x50, 0x4b]), { status: 200 }),
            );
          }

          return HttpClientResponse.fromWeb(request, new Response("", { status: 200 }));
        }),
      );
      const client = createRemoteRegistryClient("https://registry.example.com", stubHttpClient);

      it.effect("getExtensions supports list mode discovery", () =>
        Effect.gen(function* () {
          const result = yield* client.getExtensionsByScope(defaultSearchOptions);
          expect(result.total).toBe(1);
          expect(result.extensions[0]?.name).toBe("my-skill");
        }),
      );

      it.effect("ownerExists succeeds via the remote owner endpoint", () =>
        Effect.gen(function* () {
          const result = yield* client.ownerExists(handle("@test"));
          expect(result).toEqual({ exists: true });
        }),
      );

      it.effect("getExtensionPackage succeeds via index + archive", () =>
        Effect.gen(function* () {
          const result = yield* client.getExtensionPackage(makePackageArgs("my-skill", "1.0.0"));
          expect(Array.from(result.archive)).toEqual([0x50, 0x4b]);
        }),
      );

      it.effect("publishExtension succeeds via remote client", () =>
        Effect.gen(function* () {
          const publishHttpClient = HttpClient.make((request) =>
            Effect.sync(() =>
              HttpClientResponse.fromWeb(
                request,
                new Response(
                  JSON.stringify({
                    owner: "@test",
                    type: "skill",
                    name: "my-skill",
                    version: "1.0.0",
                    integrity: "sha512-AAAA==",
                    sha256_hex: "aaaa",
                    published_at: "2025-01-01T00:00:00Z",
                    publish_status: "available",
                    visibility: {
                      value: "public",
                      disposition: "establish",
                      source: "platform",
                    },
                    warnings: [],
                    links: { html: "https://agentxm.ai/test/skills/my-skill" },
                  }),
                  { status: 201 },
                ),
              ),
            ),
          );
          const publishClient = createRemoteRegistryClient(
            "https://registry.example.com",
            publishHttpClient,
          );
          const result = yield* publishClient.publishExtension(
            makeRemotePublishArgs(new Uint8Array([0x50, 0x4b]), makeVersionEntry()),
          );
          expect(result).toEqual({
            published: true,
            owner: "@test",
            type: "skill",
            name: "my-skill",
            version: "1.0.0",
            integrity: "sha512-AAAA==",
            status: "available",
            visibility: {
              value: "public",
              disposition: "establish",
              source: "platform",
            },
            warnings: [],
            links: { html: "https://agentxm.ai/test/skills/my-skill" },
          });
        }),
      );

      it.effect("extensionExists succeeds for remote client", () =>
        Effect.gen(function* () {
          const result = yield* client.extensionExists(makeExistsArgs());
          expect(result).toEqual({ exists: true });
        }),
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
          yield* fs.writeFileString(
            nodePath.join(skillDir, "index.json"),
            JSON.stringify(makeIndex()),
          );

          const client = yield* createRegistryClient(registryRoot);
          const result = yield* client.getExtensionsByScope({
            ...defaultSearchOptions,
            names: ["my-skill"],
          });
          expect(result.extensions).toHaveLength(1);
          expect(at(result.extensions, 0).name).toBe("my-skill");
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect("creates a local client for a file:// URL", () => {
        const registryRoot = makeRegistryDir();
        const skillDir = nodePath.join(registryRoot, "extensions", "@test", "skills", "my-skill");

        return Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(skillDir, { recursive: true });
          yield* fs.writeFileString(
            nodePath.join(skillDir, "index.json"),
            JSON.stringify(makeIndex()),
          );

          const client = yield* createRegistryClient(`file://${registryRoot}`);
          const result = yield* client.getExtensionsByScope({
            ...defaultSearchOptions,
            names: ["my-skill"],
          });
          expect(result.extensions).toHaveLength(1);
          expect(at(result.extensions, 0).name).toBe("my-skill");
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => rmSync(registryRoot, { recursive: true })).pipe(Effect.ignore),
          ),
        );
      });

      it.effect("creates a remote client for an https:// URL", () =>
        Effect.gen(function* () {
          const client = yield* createRegistryClient("https://registry.example.com");
          expect(typeof client.getExtensionsByScope).toBe("function");
          expect(typeof client.ownerExists).toBe("function");
          expect(typeof client.getExtensionPackage).toBe("function");
        }).pipe(Effect.provide(remoteHttpLayer)),
      );

      it.effect("uses the ambient HttpClient for remote publish requests", () => {
        let requestCount = 0;

        const httpLayer = Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request) =>
            Effect.sync(() => {
              requestCount += 1;
              return HttpClientResponse.fromWeb(
                request,
                new Response(
                  JSON.stringify({
                    owner: "@test",
                    type: "skill",
                    name: "my-skill",
                    version: "1.0.0",
                    integrity: "sha512-AAAA==",
                    sha256_hex: "aaaa",
                    published_at: "2025-01-01T00:00:00Z",
                    publish_status: "available",
                    visibility: {
                      value: "public",
                      disposition: "establish",
                      source: "platform",
                    },
                    warnings: [],
                    links: { html: "https://agentxm.ai/test/skills/my-skill" },
                  }),
                  { status: 201 },
                ),
              );
            }),
          ),
        );

        return Effect.gen(function* () {
          const client = yield* createRegistryClient("https://registry.example.com");

          const archive = createTestZip("SKILL.md", "# ambient auth");
          const integrity = yield* computeIntegrity(archive);

          yield* client.publishExtension(
            makeRemotePublishArgs(
              archive,
              makeVersionEntry({
                version: "1.0.0",
                published: DateTime.makeUnsafe("2025-01-01T00:00:00Z"),
                integrity,
              }),
            ),
          );

          expect(requestCount).toBe(1);
        }).pipe(Effect.provide(httpLayer));
      });

      it.effect("creates a remote client for an http:// URL", () =>
        Effect.gen(function* () {
          const client = yield* createRegistryClient("http://registry.example.com");
          expect(typeof client.getExtensionsByScope).toBe("function");
          expect(typeof client.ownerExists).toBe("function");
          expect(typeof client.getExtensionPackage).toBe("function");
        }).pipe(Effect.provide(remoteHttpLayer)),
      );
    });
  },
);
