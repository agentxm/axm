import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  createLocalRegistryClient,
  RegistryOperationFailed,
  type RegistryClient,
  type RegistryClientFailure,
} from "./index.js";
import {
  PUBLICATION_SET_CONTRACT,
  archiveSha256Hex,
} from "@agentxm/registry-protocol/unstable/registry/publication-set";
import type { ExtensionIndex } from "@agentxm/registry-protocol/unstable/registry/schema";
import { exactVersion, extensionName, handle, versionRange } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "registry/local-storage-failures-remain-failures",
  title: "Local Registry storage failures remain failures",
  statement:
    "AXM shall distinguish an absent local Registry entry from a failed existence or directory read, report an attributed operation failure for the latter instead of claiming absence or an empty catalog, and preserve existing publication files when index existence cannot be determined.",
  class: "quality",
  characteristic: "reliability",
  role: "supporting",
  goals: ["safe-repetition", "trustworthy-distribution"],
  boundary: "platform",
  boundaryRationale:
    "Controlled FileSystem failures exercise the public local Registry client over temporary native files; byte and directory readback proves failed inspection preserves existing publications and releases the publication lock.",
  selection: "per-change",
  methods: ["example", "contract"],
  derivedFrom: ["cli/publish/preview-is-pure"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const target = { owner: handle("@test"), type: "skill", name: extensionName("my-skill") } as const;
const search = {
  owner: target.owner,
  names: [],
  types: [target.type],
  limit: Option.none(),
  offset: 0,
};
const archive = new Uint8Array([1, 2, 3]);
const index: ExtensionIndex = {
  ...target,
  publisherBindingId: "hbnd_test",
  deprecation: null,
  visibility: "private",
  versions: [
    {
      version: exactVersion("1.0.0"),
      published: DateTime.makeUnsafe("2025-01-01T00:00:00Z"),
      integrity: "sha512-AAAA==",
      packages: [],
    },
  ],
};

const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-registry-failures-" });
  const extensions = path.join(root, "extensions");
  const owner = path.join(extensions, target.owner);
  const type = path.join(owner, "skills");
  const dir = path.join(type, target.name);
  yield* fs.makeDirectory(dir, { recursive: true });
  const indexPath = path.join(dir, "index.json");
  const archivePath = path.join(dir, "1.0.0.zip");
  const originalIndex = JSON.stringify(index);
  yield* fs.writeFileString(indexPath, originalIndex);
  yield* fs.writeFile(archivePath, archive);
  return {
    fs,
    path,
    root,
    extensions,
    owner,
    type,
    dir,
    indexPath,
    archivePath,
    originalIndex,
    client: (overrides: Partial<FileSystem.FileSystem> = {}) =>
      createLocalRegistryClient(root, FileSystem.FileSystem.of({ ...fs, ...overrides }), path),
  };
});

const expectStorageFailure = (
  failure: RegistryClientFailure,
  cause: PlatformError.PlatformError,
) => {
  expect(failure).toBeInstanceOf(RegistryOperationFailed);
  if (!(failure instanceof RegistryOperationFailed))
    throw new Error("Expected a local Registry failure");
  expect(failure.category).toBe("internal");
  expect(failure.cause).toBe(cause);
};

const lookups: ReadonlyArray<{
  readonly name: string;
  readonly run: (client: RegistryClient) => Effect.Effect<unknown, RegistryClientFailure>;
}> = [
  { name: "owner lookup", run: (client) => client.ownerExists(target.owner) },
  { name: "extension lookup", run: (client) => client.extensionExists(target) },
  { name: "index lookup", run: (client) => client.getExtensionIndex(target) },
  {
    name: "exact version lookup",
    run: (client) => client.getExactExtensionVersion({ ...target, version: exactVersion("1.0.0") }),
  },
  {
    name: "archive lookup",
    run: (client) =>
      client.getExtensionPackage({ ...target, version: Option.some(exactVersion("1.0.0")) }),
  },
  { name: "owner catalog", run: (client) => client.getExtensionsByScope(search) },
  { name: "package discovery", run: (client) => client.discoverPackages({ packages: [] }) },
  {
    name: "publication preview",
    run: (client) =>
      client.previewExtensionPublishes({
        contract: PUBLICATION_SET_CONTRACT,
        candidates: [
          {
            target: { ...target, version: exactVersion("1.1.0") },
            participation: "publish",
            archiveSha256Hex: archiveSha256Hex(archive),
            visibility: { intent: null, request: null },
          },
        ],
      }),
  },
];

describe("Local Registry storage failure attribution", () => {
  for (const reason of ["PermissionDenied", "Unknown"] as const) {
    for (const lookup of lookups) {
      it.effect(`${lookup.name} preserves ${reason} instead of reporting absence`, () =>
        Effect.scoped(
          Effect.gen(function* () {
            const f = yield* fixture;
            const cause = PlatformError.systemError({
              _tag: reason,
              module: "FileSystem",
              method: "exists",
              pathOrDescriptor: f.indexPath,
            });
            const failure = yield* Effect.flip(
              lookup.run(f.client({ exists: () => Effect.fail(cause) })),
            );
            expectStorageFailure(failure, cause);
          }),
        ).pipe(Effect.provide(NodeServices.layer)),
      );
    }
    for (const directory of ["extensions", "owner", "type"] as const) {
      it.effect(`discovery preserves ${reason} while reading the ${directory} directory`, () =>
        Effect.scoped(
          Effect.gen(function* () {
            const f = yield* fixture;
            const cause = PlatformError.systemError({
              _tag: reason,
              module: "FileSystem",
              method: "readDirectory",
              pathOrDescriptor: f[directory],
            });
            const client = f.client({
              readDirectory: (requested) =>
                requested === f[directory] ? Effect.fail(cause) : f.fs.readDirectory(requested),
            });
            expectStorageFailure(
              yield* Effect.flip(client.discoverPackages({ packages: [] })),
              cause,
            );
          }),
        ).pipe(Effect.provide(NodeServices.layer)),
      );
    }
  }

  it.effect(
    "a pack dependency read failure does not become an unavailable dependency finding",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const f = yield* fixture;
          const cause = PlatformError.systemError({
            _tag: "PermissionDenied",
            module: "FileSystem",
            method: "exists",
            pathOrDescriptor: f.indexPath,
          });
          const client = f.client({
            exists: (requested) =>
              requested === f.indexPath ? Effect.fail(cause) : f.fs.exists(requested),
          });
          const failure = yield* Effect.flip(
            client.previewExtensionPublishes({
              contract: PUBLICATION_SET_CONTRACT,
              candidates: [
                {
                  target: {
                    owner: target.owner,
                    type: "pack",
                    name: extensionName("my-pack"),
                    version: exactVersion("1.0.0"),
                  },
                  participation: "publish",
                  archiveSha256Hex: archiveSha256Hex(archive),
                  visibility: { intent: null, request: "private" },
                  pack: { dependencies: [{ ...target, range: versionRange("^1.0.0") }] },
                },
              ],
            }),
          );
          expectStorageFailure(failure, cause);
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("publishing preserves the existing index and archive when index inspection fails", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const f = yield* fixture;
        const cause = PlatformError.systemError({
          _tag: "PermissionDenied",
          module: "FileSystem",
          method: "exists",
          pathOrDescriptor: f.indexPath,
        });
        const client = f.client({
          exists: (requested) =>
            requested === f.indexPath ? Effect.fail(cause) : f.fs.exists(requested),
        });
        const failure = yield* Effect.flip(
          client.publishExtension({
            ...target,
            version: exactVersion("1.1.0"),
            archive,
            metadata: {
              version: exactVersion("1.1.0"),
              published: DateTime.makeUnsafe("2025-02-01T00:00:00Z"),
              integrity: "sha512-AAAA==",
              packages: [],
            },
            visibilityInput: { intent: null, request: null },
          }),
        );
        expectStorageFailure(failure, cause);
        const indexAfter = yield* f.fs.readFileString(f.indexPath);
        const archiveAfter = yield* f.fs.readFile(f.archivePath);
        const newArchiveExists = yield* f.fs.exists(f.path.join(f.dir, "1.1.0.zip"));
        const filesAfter = yield* f.fs.readDirectory(f.dir);
        expect(indexAfter).toBe(f.originalIndex);
        expect(Array.from(archiveAfter)).toEqual(Array.from(archive));
        expect(newArchiveExists).toBe(false);
        expect(filesAfter.sort()).toEqual(["1.0.0.zip", "index.json"]);
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("a directory removed during discovery is still an empty selection", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const f = yield* fixture;
        const cause = PlatformError.systemError({
          _tag: "NotFound",
          module: "FileSystem",
          method: "readDirectory",
          pathOrDescriptor: f.type,
        });
        const client = f.client({
          readDirectory: (requested) =>
            requested === f.type ? Effect.fail(cause) : f.fs.readDirectory(requested),
        });
        const discovery = yield* client.discoverPackages({ packages: [] });
        const catalog = yield* client.getExtensionsByScope(search);
        expect(discovery).toEqual({ results: [] });
        expect(catalog).toEqual({ extensions: [], total: 0 });
      }),
    ).pipe(Effect.provide(NodeServices.layer)),
  );
});
