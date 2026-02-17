/**
 * Tests for registry source host providers.
 *
 * Tests LocalRegistrySourceHostProvider and RemoteRegistrySourceHostProvider
 * using mock RegistryClient instances.
 */

import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";

import { makeCliError } from "../../../cli-error/index.js";
import type {
  RegistryClient,
  RegistryExtensionManifest,
  GetExtensionsByScopeArgs,
  GetExtensionsByScopeResponse,
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

const sha512 = (data: Uint8Array): string => {
  const b64 = createHash("sha512").update(data).digest("base64");
  return `sha512-${b64}`;
};

/** Create a temp registry with scope directories and return source + cleanup. */
const makeTestRegistry = (
  scopes: ReadonlyArray<string> = ["@test"],
): { source: RegistrySource; cleanup: () => void } => {
  const dir = mkdtempSync(nodePath.join(tmpdir(), "hp-test-"));
  for (const scope of scopes) {
    mkdirSync(nodePath.join(dir, "extensions", scope), { recursive: true });
  }
  return {
    source: { type: "registry", location: new URL(`file://${dir}`) },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
};

const testSource: RegistrySource = {
  type: "registry",
  location: new URL("file:///tmp/test-registry"),
};

const defaultFindOptions: FindOptions = {
  names: [],
  type: "skill",
};

const makeVersionEntry = (overrides?: Partial<VersionEntry>): VersionEntry => ({
  version: "1.0.0",
  published: "2025-01-01T00:00:00Z",
  integrity: "sha512-0000",
  ...overrides,
});

// Minimal zip: just enough bytes to not crash extractZip in a mock context
// For fetch tests we use the mock client which returns controlled bytes

/** Wrap entries into a GetExtensionsByScopeResponse. */
const toResult = (
  extensions: ReadonlyArray<RegistryExtensionManifest>,
): GetExtensionsByScopeResponse => ({
  extensions,
  total: extensions.length,
});

/** Create a mock RegistryClient with controllable return values. */
const createMockClient = (overrides?: Partial<RegistryClient>): RegistryClient => ({
  getExtensionsByScope: () => Effect.succeed(toResult([])),
  scopeExists: () => Effect.succeed({ exists: false }),
  getExtensionPackage: () =>
    Effect.fail(makeCliError({ code: "REGISTRY_FETCH_FAILED", what: "not implemented" })),
  publishExtension: () => Effect.succeed({ published: true } as const),
  extensionExists: () => Effect.succeed({ exists: false }),
  ...overrides,
});

const createFailingClient = (): RegistryClient => ({
  getExtensionsByScope: () =>
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
  getExtensionPackage: () =>
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
  it("maps FindOptions to GetExtensionsByScopeArgs and returns SourceExtensionRefs", () => {
    const registry = makeTestRegistry();
    let capturedOptions: GetExtensionsByScopeArgs | undefined;
    const entries: ReadonlyArray<RegistryExtensionManifest> = [
      {
        scope: "@test",
        type: "skill",
        name: "my-skill",
        description: Option.some("My skill description"),
        repository: Option.some("https://github.com/test/my-skill"),
        license: Option.some("MIT"),
        authors: [{ name: "Test Author", email: Option.none(), url: Option.none() }],
        dependencies: { "@test/base-skill": "^1.2.3" },
        version: "1.0.0",
        integrity: "sha512-abc",
      },
    ];

    const client = createMockClient({
      getExtensionsByScope: (options) => {
        capturedOptions = options;
        return Effect.succeed(toResult(entries));
      },
    });

    const provider = createLocalRegistrySourceHostProvider(client);

    return runEffect(
      Effect.gen(function* () {
        const findOptions: FindOptions = {
          names: ["my-skill"],
          type: "skill",
        };
        const refs = yield* provider.find(registry.source, findOptions);

        // Verify search options were mapped correctly
        expect(capturedOptions).toEqual({
          scope: "@test",
          names: ["my-skill"],
          types: ["skill"],
          limit: Option.none(),
          offset: 0,
        });

        // Verify SourceExtensionRef mapping
        expect(refs).toHaveLength(1);
        const ref = refs[0]!;
        expect(ref.type).toBe("skill");
        expect(ref.source).toBe(registry.source);
        // Assertion needed: TS can't narrow SkillExtensionRef union to RegistrySkillRef
        const skillRef = ref as RegistrySkillRef;
        expect(skillRef.skill.name).toBe("my-skill");
        expect(skillRef.skill.description).toBe("My skill description");
        expect(skillRef.skill.metadata).toEqual(
          Option.some({
            repository: "https://github.com/test/my-skill",
            license: "MIT",
            authors: [{ name: "Test Author" }],
            dependencies: { "@test/base-skill": "^1.2.3" },
          }),
        );
        expect(skillRef.scope).toBe("@test");
        expect(skillRef.version).toBe("1.0.0");
        expect(skillRef.integrity).toBe("sha512-abc");
      }).pipe(Effect.ensuring(Effect.sync(() => registry.cleanup()))),
    );
  });

  it("maps mcp-server entries to McpServerExtensionRef", () => {
    const registry = makeTestRegistry();
    const entries: ReadonlyArray<RegistryExtensionManifest> = [
      {
        scope: "@test",
        type: "mcp-server",
        name: "my-server",
        description: Option.none(),
        repository: Option.none(),
        license: Option.none(),
        authors: [],
        dependencies: {},
        version: "2.0.0",
        integrity: "sha512-def",
      },
    ];

    const client = createMockClient({
      getExtensionsByScope: () => Effect.succeed(toResult(entries)),
    });

    const provider = createLocalRegistrySourceHostProvider(client);

    return runEffect(
      Effect.gen(function* () {
        const refs = yield* provider.find(registry.source, {
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
      }).pipe(Effect.ensuring(Effect.sync(() => registry.cleanup()))),
    );
  });

  it("maps pack entries to PackExtensionRef", () => {
    const registry = makeTestRegistry();
    const entries: ReadonlyArray<RegistryExtensionManifest> = [
      {
        scope: "@test",
        type: "pack",
        name: "my-pack",
        description: Option.none(),
        repository: Option.none(),
        license: Option.none(),
        authors: [],
        dependencies: {},
        version: "3.0.0",
        integrity: "sha512-ghi",
      },
    ];

    const client = createMockClient({
      getExtensionsByScope: () => Effect.succeed(toResult(entries)),
    });

    const provider = createLocalRegistrySourceHostProvider(client);

    return runEffect(
      Effect.gen(function* () {
        const refs = yield* provider.find(registry.source, {
          ...defaultFindOptions,
          type: "pack",
        });

        expect(refs).toHaveLength(1);
        const ref = refs[0]!;
        expect(ref.type).toBe("pack");
        // Assertion needed: TS can't narrow to RegistryPackRef
        const packRef = ref as RegistryPackRef;
        expect(packRef.pack.name).toBe("my-pack");
        expect(packRef.scope).toBe("@test");
        expect(packRef.version).toBe("3.0.0");
      }).pipe(Effect.ensuring(Effect.sync(() => registry.cleanup()))),
    );
  });

  it("returns empty array when client returns empty", () => {
    const registry = makeTestRegistry();
    const client = createMockClient({
      getExtensionsByScope: () => Effect.succeed(toResult([])),
    });

    const provider = createLocalRegistrySourceHostProvider(client);

    return runEffect(
      Effect.gen(function* () {
        const refs = yield* provider.find(registry.source, defaultFindOptions);
        expect(refs).toHaveLength(0);
      }).pipe(Effect.ensuring(Effect.sync(() => registry.cleanup()))),
    );
  });

  it("maps wildcard type to client", () => {
    const registry = makeTestRegistry();
    let capturedOptions: GetExtensionsByScopeArgs | undefined;

    const client = createMockClient({
      getExtensionsByScope: (options) => {
        capturedOptions = options;
        return Effect.succeed(toResult([]));
      },
    });

    const provider = createLocalRegistrySourceHostProvider(client);

    return runEffect(
      Effect.gen(function* () {
        yield* provider.find(registry.source, { ...defaultFindOptions, type: "*" });
        expect(capturedOptions?.types).toEqual([]);
      }).pipe(Effect.ensuring(Effect.sync(() => registry.cleanup()))),
    );
  });
});

// -----------------------------------------------------------------------------
// LocalRegistrySourceHostProvider — fetch
// -----------------------------------------------------------------------------

describe("LocalRegistrySourceHostProvider.fetch", () => {
  it("delegates to client.getExtensionPackage and verifies integrity", () => {
    const archiveBytes = new Uint8Array([80, 75, 3, 4, 0, 0, 0, 0]);
    const integrity = sha512(archiveBytes);

    let capturedArgs: Parameters<RegistryClient["getExtensionPackage"]>[0] | undefined;

    const client = createMockClient({
      getExtensionPackage: (args) => {
        capturedArgs = args;
        return Effect.succeed({ archive: archiveBytes });
      },
    });

    const provider = createLocalRegistrySourceHostProvider(client);

    const ref: SourceExtensionRef = {
      type: "skill",
      skill: { name: "my-skill", description: "test", metadata: Option.none() },
      source: testSource,
      scope: "@test",
      version: "1.0.0",
      integrity,
    };

    return runEffect(
      Effect.gen(function* () {
        // extractZip will fail on the fake bytes, but we can verify the
        // client delegation happened. Use Effect.either to catch the extraction error.
        const result = yield* provider.fetch(testSource, ref).pipe(Effect.either);

        expect(capturedArgs?.scope).toBe("@test");
        expect(capturedArgs?.type).toBe("skill");
        expect(capturedArgs?.name).toBe("my-skill");
        expect(capturedArgs?.version).toEqual(Option.some("1.0.0"));

        // extractZip may fail on fake bytes, that's fine — the point is
        // that the integrity passed and client was called correctly
        // If it succeeded, that means extraction worked; if it failed,
        // it should be a SOURCE_FETCH_FAILED from extractZip, not integrity
        if (result._tag === "Left") {
          expect(result.left.code).toBe("SOURCE_FETCH_FAILED");
          expect(result.left.what).not.toContain("Integrity mismatch");
        }
      }),
    );
  });

  it("fails on integrity mismatch", () => {
    const archiveBytes = new Uint8Array([80, 75, 3, 4]);

    const client = createMockClient({
      getExtensionPackage: () => Effect.succeed({ archive: archiveBytes }),
    });

    const provider = createLocalRegistrySourceHostProvider(client);

    const ref: SourceExtensionRef = {
      type: "skill",
      skill: { name: "my-skill", description: "test", metadata: Option.none() },
      source: testSource,
      scope: "@test",
      version: "1.0.0",
      integrity: "sha512-wrongIntegrityValue==",
    };

    return runEffect(
      Effect.gen(function* () {
        const result = yield* provider.fetch(testSource, ref).pipe(Effect.either);
        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.code).toBe("SOURCE_FETCH_FAILED");
          expect(result.left.what).toContain("Integrity mismatch");
        }
      }),
    );
  });

  it("extracts scope/type/name/version from mcp-server ref", () => {
    const archiveBytes = new Uint8Array([80, 75, 3, 4]);
    const integrity = sha512(archiveBytes);

    let capturedType: string | undefined;
    let capturedName: string | undefined;

    const client = createMockClient({
      getExtensionPackage: (args) => {
        capturedType = args.type;
        capturedName = args.name;
        return Effect.succeed({ archive: archiveBytes });
      },
    });

    const provider = createLocalRegistrySourceHostProvider(client);

    const ref: SourceExtensionRef = {
      type: "mcp-server",
      server: { name: "my-server" },
      source: testSource,
      scope: "@test",
      version: "2.0.0",
      integrity,
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
    let capturedArgs: Parameters<RegistryClient["publishExtension"]>[0] | undefined;

    const client = createMockClient({
      publishExtension: (args) => {
        capturedArgs = args;
        return Effect.succeed({ published: true } as const);
      },
    });

    const provider = createLocalRegistrySourceHostProvider(client);
    const archive = new Uint8Array([1, 2, 3]);
    const metadata = makeVersionEntry();

    return runEffect(
      Effect.gen(function* () {
        yield* provider.publishExtension("@test", "skill", "my-skill", "1.0.0", archive, metadata);

        expect(capturedArgs?.scope).toBe("@test");
        expect(capturedArgs?.type).toBe("skill");
        expect(capturedArgs?.name).toBe("my-skill");
        expect(capturedArgs?.version).toBe("1.0.0");
        expect(capturedArgs?.archive).toBe(archive);
        expect(capturedArgs?.metadata).toBe(metadata);
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
      integrity: "sha512-abc",
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
