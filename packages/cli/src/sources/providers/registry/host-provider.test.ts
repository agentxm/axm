/**
 * Tests for registry source host providers.
 *
 * Tests LocalRegistrySourceHostProvider and RemoteRegistrySourceHostProvider
 * using mock RegistryClient instances.
 */

import { createHash } from "node:crypto";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";

import { makeCliError } from "../../../cli-error/index.js";
import type {
  RegistryClient,
  RegistryExtensionEntry,
  GetExtensionsArgs,
  VersionEntry,
} from "../../../registry/index.js";
import type {
  RegistryMcpServerRef,
  RegistryPackRef,
  RegistrySkillRef,
  RegistrySource,
  SourceExtensionRef,
} from "../../types.js";
import type { FindOptions } from "../../provider.js";
import {
  createLocalRegistrySourceHostProvider,
  createRemoteRegistrySourceHostProvider,
} from "./host-provider.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const runEffect = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>) =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeContext.layer)));

const sha256 = (data: Uint8Array): string => {
  const hex = createHash("sha256").update(data).digest("hex");
  return `sha256:${hex}`;
};

const testSource: RegistrySource = {
  type: "registry",
  location: new URL("file:///tmp/test-registry"),
};

const defaultFindOptions: FindOptions = {
  names: [],
  agents: [],
  type: "skill",
};

const makeVersionEntry = (overrides?: Partial<VersionEntry>): VersionEntry => ({
  version: "1.0.0",
  published: "2025-01-01T00:00:00Z",
  agents: ["claude-code"],
  checksum: "sha256:0000",
  ...overrides,
});

// Minimal zip: just enough bytes to not crash extractZip in a mock context
// For fetch tests we use the mock client which returns controlled bytes

/** Create a mock RegistryClient with controllable return values. */
const createMockClient = (overrides?: Partial<RegistryClient>): RegistryClient => ({
  getExtensions: () => Effect.succeed([]),
  scopeExists: () => Effect.succeed(false),
  getExtension: () =>
    Effect.fail(makeCliError({ code: "REGISTRY_FETCH_FAILED", what: "not implemented" })),
  publishExtension: () => Effect.void,
  extensionExists: () => Effect.succeed(false),
  ...overrides,
});

const createFailingClient = (): RegistryClient => ({
  getExtensions: () =>
    Effect.fail(
      makeCliError({
        code: "REGISTRY_REMOTE_NOT_SUPPORTED",
        what: "remote registry not yet supported",
      }),
    ),
  scopeExists: () =>
    Effect.fail(
      makeCliError({
        code: "REGISTRY_REMOTE_NOT_SUPPORTED",
        what: "remote registry not yet supported",
      }),
    ),
  getExtension: () =>
    Effect.fail(
      makeCliError({
        code: "REGISTRY_REMOTE_NOT_SUPPORTED",
        what: "remote registry not yet supported",
      }),
    ),
  publishExtension: () =>
    Effect.fail(
      makeCliError({
        code: "REGISTRY_REMOTE_NOT_SUPPORTED",
        what: "remote registry not yet supported",
      }),
    ),
  extensionExists: () =>
    Effect.fail(
      makeCliError({
        code: "REGISTRY_REMOTE_NOT_SUPPORTED",
        what: "remote registry not yet supported",
      }),
    ),
});

// -----------------------------------------------------------------------------
// LocalRegistrySourceHostProvider — find
// -----------------------------------------------------------------------------

describe("LocalRegistrySourceHostProvider.find", () => {
  it("maps FindOptions to GetExtensionsArgs and returns SourceExtensionRefs", () => {
    let capturedOptions: GetExtensionsArgs | undefined;
    const entries: ReadonlyArray<RegistryExtensionEntry> = [
      {
        scope: "@test",
        type: "skill",
        name: "my-skill",
        version: "1.0.0",
        checksum: "sha256:abc",
      },
    ];

    const client = createMockClient({
      getExtensions: (options) => {
        capturedOptions = options;
        return Effect.succeed(entries);
      },
    });

    const provider = createLocalRegistrySourceHostProvider(client);

    return runEffect(
      Effect.gen(function* () {
        const findOptions: FindOptions = {
          names: ["my-skill"],
          agents: ["claude-code"],
          type: "skill",
        };
        const refs = yield* provider.find(testSource, findOptions);

        // Verify search options were mapped correctly
        expect(capturedOptions).toEqual({
          names: ["my-skill"],
          agents: ["claude-code"],
          type: "skill",
        });

        // Verify SourceExtensionRef mapping
        expect(refs).toHaveLength(1);
        const ref = refs[0]!;
        expect(ref.type).toBe("skill");
        expect(ref.source).toBe(testSource);
        expect(ref.type).toBe("skill");
        expect(ref.source).toBe(testSource);
        // Assertion needed: TS can't narrow SkillExtensionRef union to RegistrySkillRef
        const skillRef = ref as RegistrySkillRef;
        expect(skillRef.skill.name).toBe("my-skill");
        expect(skillRef.scope).toBe("@test");
        expect(skillRef.version).toBe("1.0.0");
        expect(skillRef.checksum).toBe("sha256:abc");
      }),
    );
  });

  it("maps mcp-server entries to McpServerExtensionRef", () => {
    const entries: ReadonlyArray<RegistryExtensionEntry> = [
      {
        scope: "@test",
        type: "mcp-server",
        name: "my-server",
        version: "2.0.0",
        checksum: "sha256:def",
      },
    ];

    const client = createMockClient({
      getExtensions: () => Effect.succeed(entries),
    });

    const provider = createLocalRegistrySourceHostProvider(client);

    return runEffect(
      Effect.gen(function* () {
        const refs = yield* provider.find(testSource, {
          ...defaultFindOptions,
          type: "mcp-server",
        });

        expect(refs).toHaveLength(1);
        const ref = refs[0]!;
        expect(ref.type).toBe("mcp-server");
        // Assertion needed: TS can't narrow to RegistryMcpServerRef
        const serverRef = ref as RegistryMcpServerRef;
        expect(serverRef.server.name).toBe("my-server");
        expect(serverRef.scope).toBe("@test");
        expect(serverRef.version).toBe("2.0.0");
      }),
    );
  });

  it("maps pack entries to PackExtensionRef", () => {
    const entries: ReadonlyArray<RegistryExtensionEntry> = [
      {
        scope: "@test",
        type: "pack",
        name: "my-pack",
        version: "3.0.0",
        checksum: "sha256:ghi",
      },
    ];

    const client = createMockClient({
      getExtensions: () => Effect.succeed(entries),
    });

    const provider = createLocalRegistrySourceHostProvider(client);

    return runEffect(
      Effect.gen(function* () {
        const refs = yield* provider.find(testSource, { ...defaultFindOptions, type: "pack" });

        expect(refs).toHaveLength(1);
        const ref = refs[0]!;
        expect(ref.type).toBe("pack");
        // Assertion needed: TS can't narrow to RegistryPackRef
        const packRef = ref as RegistryPackRef;
        expect(packRef.pack.name).toBe("my-pack");
        expect(packRef.scope).toBe("@test");
        expect(packRef.version).toBe("3.0.0");
      }),
    );
  });

  it("returns empty array when client returns empty", () => {
    const client = createMockClient({
      getExtensions: () => Effect.succeed([]),
    });

    const provider = createLocalRegistrySourceHostProvider(client);

    return runEffect(
      Effect.gen(function* () {
        const refs = yield* provider.find(testSource, defaultFindOptions);
        expect(refs).toHaveLength(0);
      }),
    );
  });

  it("maps wildcard type to client", () => {
    let capturedOptions: GetExtensionsArgs | undefined;

    const client = createMockClient({
      getExtensions: (options) => {
        capturedOptions = options;
        return Effect.succeed([]);
      },
    });

    const provider = createLocalRegistrySourceHostProvider(client);

    return runEffect(
      Effect.gen(function* () {
        yield* provider.find(testSource, { ...defaultFindOptions, type: "*" });
        expect(capturedOptions?.type).toBe("*");
      }),
    );
  });
});

// -----------------------------------------------------------------------------
// LocalRegistrySourceHostProvider — fetch
// -----------------------------------------------------------------------------

describe("LocalRegistrySourceHostProvider.fetch", () => {
  it("delegates to client.getExtension and verifies checksum", () => {
    const archiveBytes = new Uint8Array([80, 75, 3, 4, 0, 0, 0, 0]);
    const checksum = sha256(archiveBytes);

    let capturedScope: string | undefined;
    let capturedType: string | undefined;
    let capturedName: string | undefined;
    let capturedVersion: string | undefined;

    const client = createMockClient({
      getExtension: (scope, type, name, version) => {
        capturedScope = scope;
        capturedType = type;
        capturedName = name;
        capturedVersion = version;
        return Effect.succeed(archiveBytes);
      },
    });

    const provider = createLocalRegistrySourceHostProvider(client);

    const ref: SourceExtensionRef = {
      type: "skill",
      skill: { name: "my-skill", description: "test", metadata: Option.none() },
      source: testSource,
      scope: "@test",
      version: "1.0.0",
      checksum,
    };

    return runEffect(
      Effect.gen(function* () {
        // extractZip will fail on the fake bytes, but we can verify the
        // client delegation happened. Use Effect.either to catch the extraction error.
        const result = yield* provider.fetch(testSource, ref).pipe(Effect.either);

        expect(capturedScope).toBe("@test");
        expect(capturedType).toBe("skill");
        expect(capturedName).toBe("my-skill");
        expect(capturedVersion).toBe("1.0.0");

        // extractZip may fail on fake bytes, that's fine — the point is
        // that the checksum passed and client was called correctly
        // If it succeeded, that means extraction worked; if it failed,
        // it should be a SOURCE_FETCH_FAILED from extractZip, not checksum
        if (result._tag === "Left") {
          expect(result.left.code).toBe("SOURCE_FETCH_FAILED");
          expect(result.left.what).not.toContain("Checksum mismatch");
        }
      }),
    );
  });

  it("fails on checksum mismatch", () => {
    const archiveBytes = new Uint8Array([80, 75, 3, 4]);

    const client = createMockClient({
      getExtension: () => Effect.succeed(archiveBytes),
    });

    const provider = createLocalRegistrySourceHostProvider(client);

    const ref: SourceExtensionRef = {
      type: "skill",
      skill: { name: "my-skill", description: "test", metadata: Option.none() },
      source: testSource,
      scope: "@test",
      version: "1.0.0",
      checksum: "sha256:wrong_checksum_value",
    };

    return runEffect(
      Effect.gen(function* () {
        const result = yield* provider.fetch(testSource, ref).pipe(Effect.either);
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.code).toBe("SOURCE_FETCH_FAILED");
          expect(result.left.what).toContain("Checksum mismatch");
        }
      }),
    );
  });

  it("extracts scope/type/name/version from mcp-server ref", () => {
    const archiveBytes = new Uint8Array([80, 75, 3, 4]);
    const checksum = sha256(archiveBytes);

    let capturedType: string | undefined;
    let capturedName: string | undefined;

    const client = createMockClient({
      getExtension: (_scope, type, name, _version) => {
        capturedType = type;
        capturedName = name;
        return Effect.succeed(archiveBytes);
      },
    });

    const provider = createLocalRegistrySourceHostProvider(client);

    const ref: SourceExtensionRef = {
      type: "mcp-server",
      server: { name: "my-server" },
      source: testSource,
      scope: "@test",
      version: "2.0.0",
      checksum,
    };

    return runEffect(
      Effect.gen(function* () {
        yield* provider.fetch(testSource, ref).pipe(Effect.either);
        expect(capturedType).toBe("mcp-server");
        expect(capturedName).toBe("my-server");
      }),
    );
  });
});

// -----------------------------------------------------------------------------
// LocalRegistrySourceHostProvider — publishExtension
// -----------------------------------------------------------------------------

describe("LocalRegistrySourceHostProvider.publishExtension", () => {
  it("delegates to client.publishExtension", () => {
    let capturedScope: string | undefined;
    let capturedType: string | undefined;
    let capturedName: string | undefined;
    let capturedVersion: string | undefined;
    let capturedArchive: Uint8Array | undefined;
    let capturedMetadata: VersionEntry | undefined;

    const client = createMockClient({
      publishExtension: (scope, type, name, version, archive, metadata) => {
        capturedScope = scope;
        capturedType = type;
        capturedName = name;
        capturedVersion = version;
        capturedArchive = archive;
        capturedMetadata = metadata;
        return Effect.void;
      },
    });

    const provider = createLocalRegistrySourceHostProvider(client);
    const archive = new Uint8Array([1, 2, 3]);
    const metadata = makeVersionEntry();

    return runEffect(
      Effect.gen(function* () {
        yield* provider.publishExtension("@test", "skill", "my-skill", "1.0.0", archive, metadata);

        expect(capturedScope).toBe("@test");
        expect(capturedType).toBe("skill");
        expect(capturedName).toBe("my-skill");
        expect(capturedVersion).toBe("1.0.0");
        expect(capturedArchive).toBe(archive);
        expect(capturedMetadata).toBe(metadata);
      }),
    );
  });
});

// -----------------------------------------------------------------------------
// LocalRegistrySourceHostProvider — match
// -----------------------------------------------------------------------------

describe("LocalRegistrySourceHostProvider.match", () => {
  it("matches file:// URLs", () => {
    const client = createMockClient();
    const provider = createLocalRegistrySourceHostProvider(client);

    return runEffect(
      Effect.gen(function* () {
        const matches = yield* provider.match(new URL("file:///tmp/registry"));
        expect(matches).toBe(true);
      }),
    );
  });

  it("does not match https:// URLs", () => {
    const client = createMockClient();
    const provider = createLocalRegistrySourceHostProvider(client);

    return runEffect(
      Effect.gen(function* () {
        const matches = yield* provider.match(new URL("https://registry.example.com"));
        expect(matches).toBe(false);
      }),
    );
  });
});

// -----------------------------------------------------------------------------
// RemoteRegistrySourceHostProvider
// -----------------------------------------------------------------------------

describe("RemoteRegistrySourceHostProvider", () => {
  it("find fails when client returns error", () => {
    const client = createFailingClient();
    const provider = createRemoteRegistrySourceHostProvider(client);

    return runEffect(
      Effect.gen(function* () {
        const result = yield* provider.find(testSource, defaultFindOptions).pipe(Effect.either);
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.code).toBe("REGISTRY_REMOTE_NOT_SUPPORTED");
        }
      }),
    );
  });

  it("fetch fails when client returns error", () => {
    const client = createFailingClient();
    const provider = createRemoteRegistrySourceHostProvider(client);

    const ref: SourceExtensionRef = {
      type: "skill",
      skill: { name: "my-skill", description: "test", metadata: Option.none() },
      source: testSource,
      scope: "@test",
      version: "1.0.0",
      checksum: "sha256:abc",
    };

    return runEffect(
      Effect.gen(function* () {
        const result = yield* provider.fetch(testSource, ref).pipe(Effect.either);
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.code).toBe("REGISTRY_REMOTE_NOT_SUPPORTED");
        }
      }),
    );
  });

  it("publishExtension fails when client returns error", () => {
    const client = createFailingClient();
    const provider = createRemoteRegistrySourceHostProvider(client);

    return runEffect(
      Effect.gen(function* () {
        const result = yield* provider
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
    );
  });

  it("matches https:// URLs", () => {
    const client = createFailingClient();
    const provider = createRemoteRegistrySourceHostProvider(client);

    return runEffect(
      Effect.gen(function* () {
        const matches = yield* provider.match(new URL("https://registry.example.com"));
        expect(matches).toBe(true);
      }),
    );
  });

  it("does not match file:// URLs", () => {
    const client = createFailingClient();
    const provider = createRemoteRegistrySourceHostProvider(client);

    return runEffect(
      Effect.gen(function* () {
        const matches = yield* provider.match(new URL("file:///tmp/registry"));
        expect(matches).toBe(false);
      }),
    );
  });
});
