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
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";
import { describe, expect, it } from "@effect/vitest";

import { makeAppError } from "../../../app-error/index.js";
import type {
  RegistryClient,
  RegistryExtensionManifest,
  GetExtensionsByOwnerArgs,
  GetExtensionsByOwnerResponse,
  VersionEntry,
} from "../../../registry/index.js";
import type { ExtensionRef } from "../../../extensions/index.js";
import type { RegistrySkillRef } from "../../../skills/index.js";
import type { RegistryCommandRef } from "../../../commands/index.js";
import type { RegistryMcpServerRef } from "../../../mcps/index.js";
import type { RegistryPackRef } from "../../../packs/index.js";
import type { RegistrySubagentRef } from "../../../subagents/index.js";
import type { RegistrySource, FindOptions } from "../../../sources/index.js";
import {
  createLocalRegistrySourceHostProvider,
  createRemoteRegistrySourceHostProvider,
} from "./host-provider.js";
import {
  at,
  dependencyConstraints,
  extensionName,
  exactVersion,
  handle,
} from "../../../test-helpers.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const runEffect = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Scope.Scope>,
) => effect.pipe(Effect.scoped, Effect.provide(NodeServices.layer));

const sha512 = (data: Uint8Array): string => {
  const b64 = createHash("sha512").update(data).digest("base64");
  return `sha512-${b64}`;
};

/** Create a temp registry with owner directories and return source + cleanup. */
const makeTestRegistry = (
  namespaces: ReadonlyArray<string> = ["@test"],
): { source: RegistrySource; cleanup: () => void } => {
  const dir = mkdtempSync(nodePath.join(tmpdir(), "hp-test-"));
  for (const owner of namespaces) {
    mkdirSync(nodePath.join(dir, "extensions", owner), { recursive: true });
  }
  return {
    source: { type: "registry", location: new URL(`file://${dir}`), owner: Option.none() },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
};

const testSource: RegistrySource = {
  type: "registry",
  location: new URL("file:///tmp/test-registry"),
  owner: Option.none(),
};

const defaultFindOptions: FindOptions = {
  names: [],
  type: "skill",
  owner: Option.none(),
  versionRange: Option.none(),
};

const makeVersionEntry = (overrides?: {
  readonly version?: string;
  readonly published?: string;
  readonly integrity?: string;
  readonly dependencies?: Record<string, string>;
}): VersionEntry => ({
  version: exactVersion(overrides?.version ?? "1.0.0"),
  published: overrides?.published ?? "2025-01-01T00:00:00Z",
  integrity: overrides?.integrity ?? "sha512-0000",
  ...(overrides?.dependencies === undefined
    ? {}
    : { dependencies: dependencyConstraints(overrides.dependencies) }),
});

// Minimal zip: just enough bytes to not crash extractZip in a mock context
// For fetch tests we use the mock client which returns controlled bytes

/** Wrap entries into a GetExtensionsByOwnerResponse. */
const toResult = (
  extensions: ReadonlyArray<RegistryExtensionManifest>,
): GetExtensionsByOwnerResponse => ({
  extensions,
  total: extensions.length,
});

const makeManifest = (overrides?: {
  readonly owner?: string;
  readonly type?: RegistryExtensionManifest["type"];
  readonly name?: string;
  readonly description?: Option.Option<string>;
  readonly repository?: RegistryExtensionManifest["repository"];
  readonly bugs?: RegistryExtensionManifest["bugs"];
  readonly license?: Option.Option<string>;
  readonly authors?: RegistryExtensionManifest["authors"];
  readonly dependencies?: Record<string, string>;
  readonly version?: string;
  readonly integrity?: string;
}): RegistryExtensionManifest => ({
  owner: handle(overrides?.owner ?? "@test"),
  type: overrides?.type ?? "skill",
  name: extensionName(overrides?.name ?? "my-skill"),
  description: overrides?.description ?? Option.none(),
  repository: overrides?.repository ?? Option.none(),
  bugs: overrides?.bugs ?? Option.none(),
  license: overrides?.license ?? Option.none(),
  authors: overrides?.authors ?? [],
  dependencies: dependencyConstraints(overrides?.dependencies ?? {}),
  version: exactVersion(overrides?.version ?? "1.0.0"),
  integrity: overrides?.integrity ?? "sha512-abc",
  packages: [],
});

/** Create a mock RegistryClient with controllable return values. */
const createMockClient = (overrides?: Partial<RegistryClient>): RegistryClient => ({
  getExtensionsByScope: () => Effect.succeed(toResult([])),
  ownerExists: () => Effect.succeed({ exists: false }),
  getExtensionIndex: () => Effect.succeed(Option.none()),
  getExtensionPackage: () =>
    Effect.fail(
      makeAppError({
        code: "internal",
        detail: "not implemented",
      }),
    ),
  publishExtension: () => Effect.succeed({ published: true } as const),
  extensionExists: () => Effect.succeed({ exists: false }),
  discoverPackages: () => Effect.succeed({ results: [] }),
  ...overrides,
});

const createFailingClient = (): RegistryClient => ({
  getExtensionsByScope: () =>
    Effect.fail(
      makeAppError({
        code: "internal",
        detail: "remote registry not yet supported",
      }),
    ),
  ownerExists: () =>
    Effect.fail(
      makeAppError({
        code: "internal",
        detail: "remote registry not yet supported",
      }),
    ),
  getExtensionIndex: () =>
    Effect.fail(
      makeAppError({
        code: "internal",
        detail: "remote registry not yet supported",
      }),
    ),
  getExtensionPackage: () =>
    Effect.fail(
      makeAppError({
        code: "internal",
        detail: "remote registry not yet supported",
      }),
    ),
  publishExtension: () =>
    Effect.fail(
      makeAppError({
        code: "internal",
        detail: "remote registry not yet supported",
      }),
    ),
  extensionExists: () =>
    Effect.fail(
      makeAppError({
        code: "internal",
        detail: "remote registry not yet supported",
      }),
    ),
  discoverPackages: () =>
    Effect.fail(
      makeAppError({
        code: "internal",
        detail: "remote registry not yet supported",
      }),
    ),
});

const expectRegistrySkillRef = (ref: ExtensionRef): RegistrySkillRef => {
  if (ref.type !== "skill" || ref.refType !== "registry") {
    throw new Error("Expected registry skill ref");
  }

  return ref;
};

const expectRegistryMcpServerRef = (ref: ExtensionRef): RegistryMcpServerRef => {
  if (ref.type !== "mcp-server" || ref.refType !== "registry") {
    throw new Error("Expected registry mcp-server ref");
  }

  return ref;
};

const expectRegistryCommandRef = (ref: ExtensionRef): RegistryCommandRef => {
  if (ref.type !== "command" || ref.refType !== "registry") {
    throw new Error("Expected registry command ref");
  }

  return ref;
};

const expectRegistryPackRef = (ref: ExtensionRef): RegistryPackRef => {
  if (ref.type !== "pack" || ref.refType !== "registry") {
    throw new Error("Expected registry pack ref");
  }

  return ref;
};

const expectRegistrySubagentRef = (ref: ExtensionRef): RegistrySubagentRef => {
  if (ref.type !== "subagent" || ref.refType !== "registry") {
    throw new Error("Expected registry subagent ref");
  }

  return ref;
};

// -----------------------------------------------------------------------------
// LocalRegistrySourceHostProvider — find
// -----------------------------------------------------------------------------

describe("LocalRegistrySourceHostProvider.find", () => {
  it.effect("maps FindOptions to GetExtensionsByOwnerArgs and returns ExtensionRefs", () => {
    const registry = makeTestRegistry();
    let capturedOptions: GetExtensionsByOwnerArgs | undefined;
    const entries: ReadonlyArray<RegistryExtensionManifest> = [
      makeManifest({
        description: Option.some("My skill description"),
        repository: Option.some("https://github.com/test/my-skill"),
        license: Option.some("MIT"),
        authors: [{ name: "Test Author", email: Option.none(), url: Option.none() }],
        dependencies: { "@test/skills/base-skill": "^1.2.3" },
      }),
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
          names: ["my-skill"],
          type: "skill",
          owner: Option.none(),
          versionRange: Option.none(),
        };
        const refs = yield* provider.find(registry.source, findOptions);

        // Verify search options were mapped correctly
        expect(capturedOptions).toEqual({
          owner: "@test",
          names: ["my-skill"],
          types: ["skill"],
          limit: Option.none(),
          offset: 0,
        });

        // Verify ExtensionRef mapping
        expect(refs).toHaveLength(1);
        const ref = at(refs, 0);
        expect(ref.type).toBe("skill");
        expect(ref.refType).toBe("registry");
        const skillRef = expectRegistrySkillRef(ref);
        expect(skillRef.source).toBe(registry.source);
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
        expect(skillRef.owner).toBe("@test");
        expect(skillRef.name).toBe("my-skill");
        expect(skillRef.version).toBe("1.0.0");
        expect(skillRef.integrity).toEqual(Option.some("sha512-abc"));
      }).pipe(Effect.ensuring(Effect.sync(() => registry.cleanup()))),
    );
  });

  it.effect("maps mcp-server entries to McpServerExtensionRef", () => {
    const registry = makeTestRegistry();
    const entries: ReadonlyArray<RegistryExtensionManifest> = [
      makeManifest({
        type: "mcp-server",
        name: "my-server",
        version: "2.0.0",
        integrity: "sha512-def",
      }),
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
        const ref = at(refs, 0);
        expect(ref.type).toBe("mcp-server");
        expect(ref.refType).toBe("registry");
        const serverRef = expectRegistryMcpServerRef(ref);
        expect(serverRef.server.name).toBe("my-server");
        expect(serverRef.owner).toBe("@test");
        expect(serverRef.name).toBe("my-server");
        expect(serverRef.version).toBe("2.0.0");
      }).pipe(Effect.ensuring(Effect.sync(() => registry.cleanup()))),
    );
  });

  it.effect("maps command entries to CommandExtensionRef", () => {
    const registry = makeTestRegistry();
    const entries: ReadonlyArray<RegistryExtensionManifest> = [
      makeManifest({
        type: "command",
        name: "my-command",
        version: "1.5.0",
        integrity: "sha512-cmd",
      }),
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
        const ref = at(refs, 0);
        expect(ref.type).toBe("command");
        expect(ref.refType).toBe("registry");
        const cmdRef = expectRegistryCommandRef(ref);
        expect(cmdRef.command.name).toBe("my-command");
        expect(cmdRef.owner).toBe("@test");
        expect(cmdRef.name).toBe("my-command");
        expect(cmdRef.version).toBe("1.5.0");
      }).pipe(Effect.ensuring(Effect.sync(() => registry.cleanup()))),
    );
  });

  it.effect("maps subagent entries to SubagentExtensionRef", () => {
    const registry = makeTestRegistry();
    const entries: ReadonlyArray<RegistryExtensionManifest> = [
      makeManifest({
        type: "subagent",
        name: "researcher",
        version: "1.2.0",
        integrity: "sha512-sub",
        description: Option.some("Research helper"),
      }),
    ];

    const client = createMockClient({
      getExtensionsByScope: () => Effect.succeed(toResult(entries)),
    });

    const provider = createLocalRegistrySourceHostProvider(client);

    return runEffect(
      Effect.gen(function* () {
        const refs = yield* provider.find(registry.source, {
          ...defaultFindOptions,
          type: "subagent",
        });

        expect(refs).toHaveLength(1);
        const ref = at(refs, 0);
        expect(ref.type).toBe("subagent");
        expect(ref.refType).toBe("registry");
        const subagentRef = expectRegistrySubagentRef(ref);
        expect(subagentRef.subagent.name).toBe("researcher");
        expect(subagentRef.subagent.description).toEqual(Option.some("Research helper"));
        expect(subagentRef.owner).toBe("@test");
        expect(subagentRef.name).toBe("researcher");
        expect(subagentRef.version).toBe("1.2.0");
      }).pipe(Effect.ensuring(Effect.sync(() => registry.cleanup()))),
    );
  });

  it.effect("maps pack entries to PackRef with empty deps", () => {
    const registry = makeTestRegistry();
    const entries: ReadonlyArray<RegistryExtensionManifest> = [
      makeManifest({ type: "pack", name: "my-pack", version: "3.0.0", integrity: "sha512-ghi" }),
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
        const ref = at(refs, 0);
        expect(ref.type).toBe("pack");
        expect(ref.refType).toBe("registry");
        const packRef = expectRegistryPackRef(ref);
        expect(packRef.pack.name).toBe("my-pack");
        expect(packRef.pack.dependencies).toEqual({});
        expect(packRef.owner).toBe("@test");
        expect(packRef.name).toBe("my-pack");
        expect(packRef.version).toBe("3.0.0");
      }).pipe(Effect.ensuring(Effect.sync(() => registry.cleanup()))),
    );
  });

  it.effect("maps pack entries with mixed dependency types", () => {
    const registry = makeTestRegistry();
    const entries: ReadonlyArray<RegistryExtensionManifest> = [
      makeManifest({
        type: "pack",
        name: "my-pack",
        dependencies: {
          "@acme/skills/code-review": "^1.0.0",
          "@acme/skills/linter": "^2.0.0",
          "@acme/commands/formatter": "^1.5.0",
          "@acme/mcps/db": "^3.0.0",
        },
        integrity: "sha512-mixed",
      }),
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
        const packRef = expectRegistryPackRef(at(refs, 0));
        expect(packRef.pack.dependencies).toEqual({
          "@acme/skills/code-review": "^1.0.0",
          "@acme/skills/linter": "^2.0.0",
          "@acme/commands/formatter": "^1.5.0",
          "@acme/mcps/db": "^3.0.0",
        });
      }).pipe(Effect.ensuring(Effect.sync(() => registry.cleanup()))),
    );
  });

  it.effect("preserves dependency metadata in pack entries", () => {
    const registry = makeTestRegistry();
    const entries: ReadonlyArray<RegistryExtensionManifest> = [
      {
        ...makeManifest({
          type: "pack",
          name: "my-pack",
          integrity: "sha512-malformed",
        }),
        // Assertion needed: this test intentionally bypasses schema validation to
        // verify the provider preserves registry dependency metadata as received.
        dependencies: {
          "@acme/skills/valid": "^1.0.0",
          "no-owner": "^1.0.0",
          "@acme/unknown-type/foo": "^1.0.0",
          "@acme/packs/nested": "^1.0.0",
        } as unknown as RegistryExtensionManifest["dependencies"],
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
        const packRef = expectRegistryPackRef(at(refs, 0));
        expect(packRef.pack.dependencies).toEqual({
          "@acme/skills/valid": "^1.0.0",
          "no-owner": "^1.0.0",
          "@acme/unknown-type/foo": "^1.0.0",
          "@acme/packs/nested": "^1.0.0",
        });
      }).pipe(Effect.ensuring(Effect.sync(() => registry.cleanup()))),
    );
  });

  it.effect("returns empty array when client returns empty", () => {
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

  it.effect("maps wildcard type to client", () => {
    const registry = makeTestRegistry();
    let capturedOptions: GetExtensionsByOwnerArgs | undefined;

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
  it.effect("delegates to client.getExtensionPackage and verifies integrity", () => {
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
      skill: {
        name: extensionName("my-skill"),
        description: Option.some("test"),
        metadata: Option.none(),
      },
      source: testSource,
      owner: handle("@test"),
      name: extensionName("my-skill"),
      version: exactVersion("1.0.0"),
      integrity: Option.some(integrity),
      packages: [],
    };

    return runEffect(
      Effect.gen(function* () {
        // extractZip will fail on the fake bytes, but we can verify the
        // client delegation happened. Use Effect.result to catch the extraction error.
        const result = yield* provider.fetch(testSource, ref).pipe(Effect.result);

        expect(capturedArgs?.owner).toBe("@test");
        expect(capturedArgs?.type).toBe("skill");
        expect(capturedArgs?.name).toBe("my-skill");
        expect(capturedArgs?.version).toEqual(Option.some(exactVersion("1.0.0")));

        // extractZip may fail on fake bytes, that's fine — the point is
        // that the integrity passed and client was called correctly
        // If it succeeded, that means extraction worked; if it failed,
        // it should be a SOURCE_FETCH_FAILED from extractZip, not integrity
        if (result._tag === "Failure") {
          expect(result.failure.code).toBe("network");
          expect(result.failure.detail).not.toContain("Integrity mismatch");
        }
      }),
    );
  });

  it.effect("fails on integrity mismatch", () => {
    const archiveBytes = new Uint8Array([80, 75, 3, 4]);

    const client = createMockClient({
      getExtensionPackage: () => Effect.succeed({ archive: archiveBytes }),
    });

    const provider = createLocalRegistrySourceHostProvider(client);

    const ref: ExtensionRef = {
      type: "skill",
      refType: "registry",
      skill: {
        name: extensionName("my-skill"),
        description: Option.some("test"),
        metadata: Option.none(),
      },
      source: testSource,
      owner: handle("@test"),
      name: extensionName("my-skill"),
      version: exactVersion("1.0.0"),
      integrity: Option.some("sha512-wrongIntegrityValue=="),
      packages: [],
    };

    return runEffect(
      Effect.gen(function* () {
        const result = yield* provider.fetch(testSource, ref).pipe(Effect.result);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          expect(result.failure.code).toBe("network");
          expect(result.failure.detail).toContain("Integrity mismatch");
        }
      }),
    );
  });

  it.effect("extracts owner/type/name/version from mcp-server ref", () => {
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
      server: { name: extensionName("my-server") },
      source: testSource,
      owner: handle("@test"),
      name: extensionName("my-server"),
      version: exactVersion("2.0.0"),
      integrity: Option.some(integrity),
      packages: [],
    };

    return runEffect(
      Effect.gen(function* () {
        yield* provider.fetch(testSource, ref).pipe(Effect.result);
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
  it.effect("delegates to client.publishExtension", () => {
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
        yield* provider.publishExtension(
          handle("@test"),
          "skill",
          extensionName("my-skill"),
          exactVersion("1.0.0"),
          archive,
          metadata,
        );

        expect(capturedArgs?.owner).toBe("@test");
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
  it.effect("matches file:// URLs", () => {
    const client = createMockClient();
    const provider = createLocalRegistrySourceHostProvider(client);

    return runEffect(
      Effect.gen(function* () {
        const matches = yield* provider.match(new URL("file:///tmp/registry"));
        expect(matches).toBe(true);
      }),
    );
  });

  it.effect("does not match https:// URLs", () => {
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
  it.effect("find fails when client returns error", () => {
    const client = createFailingClient();
    const provider = createRemoteRegistrySourceHostProvider(client);

    return runEffect(
      Effect.gen(function* () {
        const result = yield* provider.find(testSource, defaultFindOptions).pipe(Effect.result);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          expect(result.failure.code).toBe("internal");
        }
      }),
    );
  });

  it.effect("fetch fails when client returns error", () => {
    const client = createFailingClient();
    const provider = createRemoteRegistrySourceHostProvider(client);

    const ref: ExtensionRef = {
      type: "skill",
      refType: "registry",
      skill: {
        name: extensionName("my-skill"),
        description: Option.some("test"),
        metadata: Option.none(),
      },
      source: testSource,
      owner: handle("@test"),
      name: extensionName("my-skill"),
      version: exactVersion("1.0.0"),
      integrity: Option.some("sha512-abc"),
      packages: [],
    };

    return runEffect(
      Effect.gen(function* () {
        const result = yield* provider.fetch(testSource, ref).pipe(Effect.result);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          expect(result.failure.code).toBe("internal");
        }
      }),
    );
  });

  it.effect("publishExtension fails when client returns error", () => {
    const client = createFailingClient();
    const provider = createRemoteRegistrySourceHostProvider(client);

    return runEffect(
      Effect.gen(function* () {
        const result = yield* provider
          .publishExtension(
            handle("@test"),
            "skill",
            extensionName("my-skill"),
            exactVersion("1.0.0"),
            new Uint8Array(),
            makeVersionEntry(),
          )
          .pipe(Effect.result);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          expect(result.failure.code).toBe("internal");
        }
      }),
    );
  });

  it.effect("matches https:// URLs", () => {
    const client = createFailingClient();
    const provider = createRemoteRegistrySourceHostProvider(client);

    return runEffect(
      Effect.gen(function* () {
        const matches = yield* provider.match(new URL("https://registry.example.com"));
        expect(matches).toBe(true);
      }),
    );
  });

  it.effect("does not match file:// URLs", () => {
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
