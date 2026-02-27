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
import type * as Scope from "effect/Scope";
import { describe, expect, it } from "vitest";

import { makeCliError } from "../../../cli-error/index.js";
import type {
  RegistryClient,
  RegistryExtensionManifest,
  GetExtensionsByNamespaceArgs,
  GetExtensionsByNamespaceResponse,
  VersionEntry,
} from "../../../registry/index.js";
import type {
  RegistryCommandRef,
  RegistryMcpServerRef,
  RegistryPackRef,
  RegistrySkillRef,
  RegistrySource,
  ExtensionRef,
} from "../../types.js";
import type { FindOptions } from "../../provider.js";
import {
  createLocalRegistrySourceHostProvider,
  createRemoteRegistrySourceHostProvider,
} from "./host-provider.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const runEffect = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Scope.Scope>,
) => Effect.runPromise(effect.pipe(Effect.scoped, Effect.provide(NodeContext.layer)));

const sha512 = (data: Uint8Array): string => {
  const b64 = createHash("sha512").update(data).digest("base64");
  return `sha512-${b64}`;
};

/** Create a temp registry with namespace directories and return source + cleanup. */
const makeTestRegistry = (
  namespaces: ReadonlyArray<string> = ["@test"],
): { source: RegistrySource; cleanup: () => void } => {
  const dir = mkdtempSync(nodePath.join(tmpdir(), "hp-test-"));
  for (const namespace of namespaces) {
    mkdirSync(nodePath.join(dir, "extensions", namespace), { recursive: true });
  }
  return {
    source: { type: "registry", location: new URL(`file://${dir}`), namespace: Option.none() },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
};

const testSource: RegistrySource = {
  type: "registry",
  location: new URL("file:///tmp/test-registry"),
  namespace: Option.none(),
};

const defaultFindOptions: FindOptions = {
  skillNames: [],
  type: "skill",
  namespace: Option.none(),
  versionConstraint: Option.none(),
};

const makeVersionEntry = (overrides?: Partial<VersionEntry>): VersionEntry => ({
  version: "1.0.0",
  published: "2025-01-01T00:00:00Z",
  integrity: "sha512-0000",
  ...overrides,
});

// Minimal zip: just enough bytes to not crash extractZip in a mock context
// For fetch tests we use the mock client which returns controlled bytes

/** Wrap entries into a GetExtensionsByNamespaceResponse. */
const toResult = (
  extensions: ReadonlyArray<RegistryExtensionManifest>,
): GetExtensionsByNamespaceResponse => ({
  extensions,
  total: extensions.length,
});

/** Create a mock RegistryClient with controllable return values. */
const createMockClient = (overrides?: Partial<RegistryClient>): RegistryClient => ({
  getExtensionsByScope: () => Effect.succeed(toResult([])),
  namespaceExists: () => Effect.succeed({ exists: false }),
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
  namespaceExists: () =>
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
  it("maps FindOptions to GetExtensionsByNamespaceArgs and returns ExtensionRefs", () => {
    const registry = makeTestRegistry();
    let capturedOptions: GetExtensionsByNamespaceArgs | undefined;
    const entries: ReadonlyArray<RegistryExtensionManifest> = [
      {
        namespace: "@test",
        type: "skill",
        name: "my-skill",
        description: Option.some("My skill description"),
        repository: Option.some("https://github.com/test/my-skill"),
        license: Option.some("MIT"),
        authors: [{ name: "Test Author", email: Option.none(), url: Option.none() }],
        dependencies: { "@test/skills/base-skill": "^1.2.3" },
        version: "1.0.0",
        integrity: "sha512-abc",
      },
    ];

    const client = createMockClient({
      getExtensionsByScope: (args) => {
        capturedOptions = args;
        return Effect.succeed(toResult(entries));
      },
    });

    const provider = createLocalRegistrySourceHostProvider(client);

    return runEffect(
      Effect.gen(function* () {
        const findOptions: FindOptions = {
          skillNames: ["my-skill"],
          type: "skill",
          namespace: Option.none(),
          versionConstraint: Option.none(),
        };
        const refs = yield* provider.find(registry.source, findOptions);

        // Verify search options were mapped correctly
        expect(capturedOptions).toEqual({
          namespace: "@test",
          names: ["my-skill"],
          types: ["skill"],
          limit: Option.none(),
          offset: 0,
        });

        // Verify ExtensionRef mapping
        expect(refs).toHaveLength(1);
        const ref = refs[0]!;
        expect(ref.type).toBe("skill");
        expect(ref.refType).toBe("registry");
        expect(ref.source).toBe(registry.source);
        // Assertion needed: TS can't narrow SkillExtensionRef union to RegistrySkillRef
        const skillRef = ref as RegistrySkillRef;
        expect(skillRef.skill.name).toBe("my-skill");
        expect(skillRef.skill.description).toEqual(Option.some("My skill description"));
        expect(skillRef.skill.metadata).toEqual(
          Option.some({
            repository: "https://github.com/test/my-skill",
            license: "MIT",
            authors: [{ name: "Test Author" }],
            dependencies: { "@test/skills/base-skill": "^1.2.3" },
          }),
        );
        expect(skillRef.namespace).toBe("@test");
        expect(skillRef.name).toBe("my-skill");
        expect(skillRef.version).toBe("1.0.0");
        expect(skillRef.integrity).toBe("sha512-abc");
      }).pipe(Effect.ensuring(Effect.sync(() => registry.cleanup()))),
    );
  });

  it("maps mcp-server entries to McpServerExtensionRef", () => {
    const registry = makeTestRegistry();
    const entries: ReadonlyArray<RegistryExtensionManifest> = [
      {
        namespace: "@test",
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
        expect(ref.refType).toBe("registry");
        // Assertion needed: TS can't narrow to RegistryMcpServerRef
        const serverRef = ref as RegistryMcpServerRef;
        expect(serverRef.server.name).toBe("my-server");
        expect(serverRef.namespace).toBe("@test");
        expect(serverRef.name).toBe("my-server");
        expect(serverRef.version).toBe("2.0.0");
      }).pipe(Effect.ensuring(Effect.sync(() => registry.cleanup()))),
    );
  });

  it("maps command entries to CommandExtensionRef", () => {
    const registry = makeTestRegistry();
    const entries: ReadonlyArray<RegistryExtensionManifest> = [
      {
        namespace: "@test",
        type: "command",
        name: "my-command",
        description: Option.none(),
        repository: Option.none(),
        license: Option.none(),
        authors: [],
        dependencies: {},
        version: "1.5.0",
        integrity: "sha512-cmd",
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
          type: "command",
        });

        expect(refs).toHaveLength(1);
        const ref = refs[0]!;
        expect(ref.type).toBe("command");
        expect(ref.refType).toBe("registry");
        // Assertion needed: TS can't narrow to RegistryCommandRef
        const cmdRef = ref as RegistryCommandRef;
        expect(cmdRef.command.name).toBe("my-command");
        expect(cmdRef.namespace).toBe("@test");
        expect(cmdRef.name).toBe("my-command");
        expect(cmdRef.version).toBe("1.5.0");
      }).pipe(Effect.ensuring(Effect.sync(() => registry.cleanup()))),
    );
  });

  it("maps pack entries to PackExtensionRef with empty deps", () => {
    const registry = makeTestRegistry();
    const entries: ReadonlyArray<RegistryExtensionManifest> = [
      {
        namespace: "@test",
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
        expect(ref.refType).toBe("registry");
        // Assertion needed: TS can't narrow to RegistryPackRef
        const packRef = ref as RegistryPackRef;
        expect(packRef.pack.name).toBe("my-pack");
        expect(packRef.pack.skills).toEqual({});
        expect(packRef.pack.commands).toEqual({});
        expect(packRef.pack.mcpServers).toEqual({});
        expect(packRef.namespace).toBe("@test");
        expect(packRef.name).toBe("my-pack");
        expect(packRef.version).toBe("3.0.0");
      }).pipe(Effect.ensuring(Effect.sync(() => registry.cleanup()))),
    );
  });

  it("maps pack entries with mixed dependency types", () => {
    const registry = makeTestRegistry();
    const entries: ReadonlyArray<RegistryExtensionManifest> = [
      {
        namespace: "@test",
        type: "pack",
        name: "my-pack",
        description: Option.none(),
        repository: Option.none(),
        license: Option.none(),
        authors: [],
        dependencies: {
          "@acme/skills/code-review": "^1.0.0",
          "@acme/skills/linter": "^2.0.0",
          "@acme/commands/formatter": "^1.5.0",
          "@acme/mcp-servers/db": "^3.0.0",
        },
        version: "1.0.0",
        integrity: "sha512-mixed",
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
        const packRef = refs[0]! as RegistryPackRef;
        expect(packRef.pack.skills).toEqual({
          "@acme/skills/code-review": "^1.0.0",
          "@acme/skills/linter": "^2.0.0",
        });
        expect(packRef.pack.commands).toEqual({
          "@acme/commands/formatter": "^1.5.0",
        });
        expect(packRef.pack.mcpServers).toEqual({
          "@acme/mcp-servers/db": "^3.0.0",
        });
      }).pipe(Effect.ensuring(Effect.sync(() => registry.cleanup()))),
    );
  });

  it("ignores malformed dependency keys in pack entries", () => {
    const registry = makeTestRegistry();
    const entries: ReadonlyArray<RegistryExtensionManifest> = [
      {
        namespace: "@test",
        type: "pack",
        name: "my-pack",
        description: Option.none(),
        repository: Option.none(),
        license: Option.none(),
        authors: [],
        dependencies: {
          "@acme/skills/valid": "^1.0.0",
          "no-namespace": "^1.0.0",
          "@acme/unknown-type/foo": "^1.0.0",
          "@acme/packs/nested": "^1.0.0",
        },
        version: "1.0.0",
        integrity: "sha512-malformed",
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
        const packRef = refs[0]! as RegistryPackRef;
        expect(packRef.pack.skills).toEqual({ "@acme/skills/valid": "^1.0.0" });
        expect(packRef.pack.commands).toEqual({});
        expect(packRef.pack.mcpServers).toEqual({});
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
    let capturedOptions: GetExtensionsByNamespaceArgs | undefined;

    const client = createMockClient({
      getExtensionsByScope: (args) => {
        capturedOptions = args;
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

    const ref: ExtensionRef = {
      type: "skill",
      refType: "registry",
      skill: { name: "my-skill", description: Option.some("test"), metadata: Option.none() },
      source: testSource,
      namespace: "@test",
      name: "my-skill",
      version: "1.0.0",
      integrity,
    };

    return runEffect(
      Effect.gen(function* () {
        // extractZip will fail on the fake bytes, but we can verify the
        // client delegation happened. Use Effect.either to catch the extraction error.
        const result = yield* provider.fetch(testSource, ref).pipe(Effect.either);

        expect(capturedArgs?.namespace).toBe("@test");
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

    const ref: ExtensionRef = {
      type: "skill",
      refType: "registry",
      skill: { name: "my-skill", description: Option.some("test"), metadata: Option.none() },
      source: testSource,
      namespace: "@test",
      name: "my-skill",
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

  it("extracts namespace/type/name/version from mcp-server ref", () => {
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

    const ref: ExtensionRef = {
      type: "mcp-server",
      refType: "registry",
      server: { name: "my-server" },
      source: testSource,
      namespace: "@test",
      name: "my-server",
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

        expect(capturedArgs?.namespace).toBe("@test");
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

    const ref: ExtensionRef = {
      type: "skill",
      refType: "registry",
      skill: { name: "my-skill", description: Option.some("test"), metadata: Option.none() },
      source: testSource,
      namespace: "@test",
      name: "my-skill",
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
