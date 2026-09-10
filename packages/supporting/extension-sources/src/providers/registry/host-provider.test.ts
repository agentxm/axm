/**
 * Tests for registry source host providers.
 *
 * Tests LocalRegistrySourceHostProvider and RemoteRegistrySourceHostProvider
 * using mock RegistryClient instances.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import { describe, expect, it } from "@effect/vitest";

import {
  RegistryOperationFailed,
  type RegistryClient,
  type RegistryExtensionManifest,
  type GetExtensionsByOwnerArgs,
  type GetExtensionsByOwnerResponse,
} from "@agentxm/registry-client";
import type { VersionEntry } from "@agentxm/registry-protocol/unstable/registry";
import { ReleaseAgeExcludePatternSchema } from "@agentxm/extension-model/unstable/extensions";
import { type ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import {
  PUBLICATION_SET_CONTRACT,
  publicationSetDigest,
} from "@agentxm/registry-protocol/unstable/registry";
import type { RegistrySkillRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { RegistryMcpServerRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { RegistryPackRef } from "@agentxm/extension-model/unstable/extensions/refs/pack";
import type { RegistrySubagentRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import type { RegistrySource } from "@agentxm/extension-model/unstable/sources/types";
import type { FindOptions } from "@agentxm/extension-model/unstable/sources/source-host-provider";
import { AxmSkillCandidateGate } from "../../axm-skill-gate.js";
import {
  createLocalRegistrySourceHostProvider,
  createRemoteRegistrySourceHostProvider,
} from "./host-provider.js";
import { sourceResolutionFailureCategory } from "../../errors.js";
import {
  at,
  dependencyConstraints,
  extensionName,
  exactVersion,
  handle,
  makeTestAxmSkillGate,
} from "../../test-helpers.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const runEffect = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    FileSystem.FileSystem | Path.Path | AxmSkillCandidateGate | Scope.Scope
  >,
) =>
  effect.pipe(
    Effect.scoped,
    Effect.provide(Layer.merge(NodeServices.layer, makeTestAxmSkillGate())),
  );

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
    source: {
      type: "registry",
      name: "agentxm",
      location: new URL(`file://${dir}`),
      owner: Option.none(),
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
};

const testSource: RegistrySource = {
  type: "registry",
  name: "agentxm",
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
  published: DateTime.makeUnsafe(overrides?.published ?? "2025-01-01T00:00:00Z"),
  integrity: overrides?.integrity ?? "sha512-0000",
  ...(overrides?.dependencies === undefined
    ? {}
    : { dependencies: dependencyConstraints(overrides.dependencies) }),
});

/** A genuine archive, built independently of the production extraction path. */
const makeFetchArchive = (files: Readonly<Record<string, string>>): Uint8Array => {
  const root = mkdtempSync(nodePath.join(tmpdir(), "provider-fetch-archive-"));
  try {
    for (const [relative, content] of Object.entries(files)) {
      const target = nodePath.join(root, relative);
      mkdirSync(nodePath.dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    const archive = nodePath.join(root, "package.zip");
    execFileSync("zip", ["-q", archive, ...Object.keys(files)], { cwd: root, stdio: "pipe" });
    return readFileSync(archive);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

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
  publisherBindingId: "hbnd_test",
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
  getExactExtensionVersion: () => Effect.succeed(Option.none()),
  getExtensionPackage: () =>
    Effect.fail(
      new RegistryOperationFailed({
        category: "internal",
        detail: "not implemented",
      }),
    ),
  publishExtension: (args) =>
    Effect.succeed({
      published: true,
      owner: args.owner,
      type: args.type,
      name: args.name,
      version: args.version,
      integrity: args.metadata.integrity,
      status: "available",
      visibility:
        args.visibility ??
        ({ value: "public", disposition: "establish", source: "platform" } as const),
      warnings: [],
    } as const),
  previewExtensionPublishes: (args) =>
    Effect.succeed({
      contract: PUBLICATION_SET_CONTRACT,
      publicationSetDigest: publicationSetDigest(args.candidates),
      status: "admitted",
      candidates: [],
      packs: [],
    }),
  getExtensionVisibility: () =>
    Effect.fail(
      new RegistryOperationFailed({
        category: "internal",
        detail: "not implemented",
      }),
    ),
  updateExtensionVisibility: () =>
    Effect.fail(
      new RegistryOperationFailed({
        category: "internal",
        detail: "not implemented",
      }),
    ),
  extensionExists: () => Effect.succeed({ exists: false }),
  discoverPackages: () => Effect.succeed({ results: [] }),
  ...overrides,
});

const createFailingClient = (): RegistryClient => ({
  getExtensionsByScope: () =>
    Effect.fail(
      new RegistryOperationFailed({
        category: "internal",
        detail: "remote registry not yet supported",
      }),
    ),
  ownerExists: () =>
    Effect.fail(
      new RegistryOperationFailed({
        category: "internal",
        detail: "remote registry not yet supported",
      }),
    ),
  getExtensionIndex: () =>
    Effect.fail(
      new RegistryOperationFailed({
        category: "internal",
        detail: "remote registry not yet supported",
      }),
    ),
  getExactExtensionVersion: () =>
    Effect.fail(
      new RegistryOperationFailed({
        category: "internal",
        detail: "remote registry not yet supported",
      }),
    ),
  getExtensionPackage: () =>
    Effect.fail(
      new RegistryOperationFailed({
        category: "internal",
        detail: "remote registry not yet supported",
      }),
    ),
  publishExtension: () =>
    Effect.fail(
      new RegistryOperationFailed({
        category: "internal",
        detail: "remote registry not yet supported",
      }),
    ),
  previewExtensionPublishes: () =>
    Effect.fail(
      new RegistryOperationFailed({
        category: "internal",
        detail: "not implemented",
      }),
    ),
  getExtensionVisibility: () =>
    Effect.fail(
      new RegistryOperationFailed({
        category: "internal",
        detail: "not implemented",
      }),
    ),
  updateExtensionVisibility: () =>
    Effect.fail(
      new RegistryOperationFailed({
        category: "internal",
        detail: "not implemented",
      }),
    ),
  extensionExists: () =>
    Effect.fail(
      new RegistryOperationFailed({
        category: "internal",
        detail: "remote registry not yet supported",
      }),
    ),
  discoverPackages: () =>
    Effect.fail(
      new RegistryOperationFailed({
        category: "internal",
        detail: "remote registry not yet supported",
      }),
    ),
});

describe("RegistrySourceHostProvider.resolveNamed", () => {
  const evaluation = {
    minimumReleaseAge: Duration.hours(24),
    evaluatedAt: DateTime.makeUnsafe("2025-01-03T00:00:00Z"),
    mode: "enforce" as const,
  };
  const options = {
    name: "my-skill",
    type: "skill" as const,
    owner: handle("@test"),
    versionRange: Option.none<string>(),
    releaseAgeEvaluation: evaluation,
  };

  it.effect("returns not_found from one index read when the target is not visible", () => {
    let reads = 0;
    const provider = createRemoteRegistrySourceHostProvider(
      createMockClient({
        getExtensionIndex: () => {
          reads += 1;
          return Effect.succeed(Option.none());
        },
      }),
    );

    return runEffect(
      Effect.gen(function* () {
        const result = yield* provider.resolveNamed(testSource, options);
        expect(result).toEqual({ kind: "not_found", target: "@test/skills/my-skill" });
        expect(reads).toBe(1);
      }),
    );
  });

  it.effect("distinguishes a visible unsatisfied range", () => {
    const provider = createRemoteRegistrySourceHostProvider(
      createMockClient({
        getExtensionIndex: () =>
          Effect.succeed(
            Option.some({
              owner: handle("@test"),
              type: "skill",
              name: extensionName("my-skill"),
              publisherBindingId: "hbnd_test",
              deprecation: null,
              versions: [makeVersionEntry({ version: "1.0.0" })],
            }),
          ),
      }),
    );

    return runEffect(
      Effect.gen(function* () {
        const result = yield* provider.resolveNamed(testSource, {
          ...options,
          versionRange: Option.some("^2.0.0"),
        });
        expect(result).toEqual({
          kind: "version_unsatisfied",
          target: "@test/skills/my-skill",
          requestedRange: "^2.0.0",
        });
      }),
    );
  });

  it.effect("returns a policy-held candidate with absolute eligibility evidence", () => {
    const provider = createRemoteRegistrySourceHostProvider(
      createMockClient({
        getExtensionIndex: () =>
          Effect.succeed(
            Option.some({
              owner: handle("@test"),
              type: "skill",
              name: extensionName("my-skill"),
              publisherBindingId: "hbnd_test",
              deprecation: null,
              versions: [makeVersionEntry({ version: "2.0.0", published: "2025-01-02T12:00:00Z" })],
            }),
          ),
      }),
    );

    return runEffect(
      Effect.gen(function* () {
        const result = yield* provider.resolveNamed(testSource, {
          ...options,
          versionRange: Option.some("2.0.0"),
        });
        expect(result).toEqual({
          kind: "policy_held",
          target: "@test/skills/my-skill",
          requestedRange: "2.0.0",
          candidate: {
            version: "2.0.0",
            publishedAt: "2025-01-02T12:00:00.000Z",
            eligibleAt: "2025-01-03T12:00:00.000Z",
            minimumReleaseAgeSeconds: 86_400,
          },
        });
      }),
    );
  });

  it.effect("selects an under-age release excluded by authoritative Registry identity", () => {
    const provider = createRemoteRegistrySourceHostProvider(
      createMockClient({
        getExtensionIndex: () =>
          Effect.succeed(
            Option.some({
              owner: handle("@test"),
              type: "skill",
              name: extensionName("my-skill"),
              publisherBindingId: "hbnd_test",
              deprecation: null,
              versions: [makeVersionEntry({ version: "2.0.0", published: "2025-01-02T12:00:00Z" })],
            }),
          ),
      }),
    );

    return runEffect(
      Effect.gen(function* () {
        const result = yield* provider.resolveNamed(testSource, {
          ...options,
          releaseAgeEvaluation: {
            ...evaluation,
            mode: "ignore",
            exclude: [
              {
                pattern: Schema.decodeUnknownSync(ReleaseAgeExcludePatternSchema)("@test/skills/*"),
                scope: "project",
              },
            ],
          },
        });
        expect(result.kind).toBe("exempted");
        if (result.kind !== "exempted") return;
        expect(result.exemption).toEqual({
          bypassCause: "exclude",
          exemptionScope: "project",
        });
      }),
    );
  });

  it.effect("does not emit bypass evidence when an excluded release is already mature", () => {
    const provider = createRemoteRegistrySourceHostProvider(
      createMockClient({
        getExtensionIndex: () =>
          Effect.succeed(
            Option.some({
              owner: handle("@test"),
              type: "skill",
              name: extensionName("my-skill"),
              publisherBindingId: "hbnd_test",
              deprecation: null,
              versions: [makeVersionEntry({ version: "1.0.0", published: "2025-01-01T00:00:00Z" })],
            }),
          ),
      }),
    );

    return runEffect(
      Effect.gen(function* () {
        const result = yield* provider.resolveNamed(testSource, {
          ...options,
          releaseAgeEvaluation: {
            ...evaluation,
            exclude: [
              {
                pattern: Schema.decodeUnknownSync(ReleaseAgeExcludePatternSchema)("@test/*"),
                scope: "user",
              },
            ],
          },
        });
        expect(result.kind).toBe("selected");
      }),
    );
  });

  it.effect("returns not_found when an exact requested release is absent", () => {
    const provider = createRemoteRegistrySourceHostProvider(
      createMockClient({
        getExtensionIndex: () =>
          Effect.succeed(
            Option.some({
              owner: handle("@test"),
              type: "skill",
              name: extensionName("my-skill"),
              publisherBindingId: "hbnd_test",
              deprecation: null,
              versions: [makeVersionEntry({ version: "1.0.0" })],
            }),
          ),
      }),
    );

    return runEffect(
      Effect.gen(function* () {
        expect(
          yield* provider.resolveNamed(testSource, {
            ...options,
            versionRange: Option.some("2.0.0"),
          }),
        ).toEqual({ kind: "not_found", target: "@test/skills/my-skill" });
      }),
    );
  });

  it.effect("selects the newest eligible version and discloses a newer held candidate", () => {
    const provider = createRemoteRegistrySourceHostProvider(
      createMockClient({
        getExtensionIndex: () =>
          Effect.succeed(
            Option.some({
              owner: handle("@test"),
              type: "skill",
              name: extensionName("my-skill"),
              publisherBindingId: "hbnd_test",
              deprecation: null,
              versions: [
                makeVersionEntry({ version: "1.0.0", published: "2025-01-01T00:00:00Z" }),
                makeVersionEntry({ version: "2.0.0", published: "2025-01-02T12:00:00Z" }),
              ],
            }),
          ),
      }),
    );

    return runEffect(
      Effect.gen(function* () {
        const result = yield* provider.resolveNamed(testSource, options);
        expect(result.kind).toBe("selected");
        if (result.kind !== "selected") return;
        if (result.ref.refType !== "registry") return;
        expect(result.ref.version).toBe("1.0.0");
        expect(result.newerHeld?.version).toBe("2.0.0");
      }),
    );
  });

  it.effect("preserves an accepted under-age version from the same publisher", () => {
    const provider = createRemoteRegistrySourceHostProvider(
      createMockClient({
        getExtensionIndex: () =>
          Effect.succeed(
            Option.some({
              owner: handle("@test"),
              type: "skill",
              name: extensionName("my-skill"),
              publisherBindingId: "hbnd_test",
              deprecation: null,
              versions: [
                makeVersionEntry({ version: "1.0.0", published: "2025-01-01T00:00:00Z" }),
                makeVersionEntry({ version: "1.5.0", published: "2025-01-02T12:00:00Z" }),
                makeVersionEntry({ version: "2.0.0", published: "2025-01-02T18:00:00Z" }),
              ],
            }),
          ),
      }),
    );

    return runEffect(
      Effect.gen(function* () {
        const result = yield* provider.resolveNamed(testSource, {
          ...options,
          accepted: { version: "1.5.0", publisherBindingId: "hbnd_test" },
        });
        expect(result.kind).toBe("selected");
        if (result.kind !== "selected") return;
        expect(result.ref.version).toBe("1.5.0");
        expect(result.newerHeld?.version).toBe("2.0.0");
      }),
    );
  });

  it.effect("does not trust an accepted version from a different publisher", () => {
    const provider = createRemoteRegistrySourceHostProvider(
      createMockClient({
        getExtensionIndex: () =>
          Effect.succeed(
            Option.some({
              owner: handle("@test"),
              type: "skill",
              name: extensionName("my-skill"),
              publisherBindingId: "hbnd_test",
              deprecation: null,
              versions: [
                makeVersionEntry({ version: "1.0.0", published: "2025-01-01T00:00:00Z" }),
                makeVersionEntry({ version: "1.5.0", published: "2025-01-02T12:00:00Z" }),
              ],
            }),
          ),
      }),
    );

    return runEffect(
      Effect.gen(function* () {
        const result = yield* provider.resolveNamed(testSource, {
          ...options,
          accepted: { version: "1.5.0", publisherBindingId: "hbnd_other" },
        });
        expect(result.kind).toBe("selected");
        if (result.kind !== "selected") return;
        expect(result.ref.version).toBe("1.0.0");
      }),
    );
  });

  it.effect("keeps members from the accepted Pack while a newer Pack is held", () => {
    const provider = createRemoteRegistrySourceHostProvider(
      createMockClient({
        getExtensionIndex: () =>
          Effect.succeed(
            Option.some({
              owner: handle("@test"),
              type: "pack",
              name: extensionName("toolkit"),
              publisherBindingId: "hbnd_test",
              deprecation: null,
              versions: [
                makeVersionEntry({ version: "1.0.0", published: "2025-01-01T00:00:00Z" }),
                makeVersionEntry({
                  version: "1.5.0",
                  published: "2025-01-02T12:00:00Z",
                  dependencies: { "@test/skills/reviewer": "^1.0.0" },
                }),
                makeVersionEntry({ version: "2.0.0", published: "2025-01-02T18:00:00Z" }),
              ],
            }),
          ),
      }),
    );

    return runEffect(
      Effect.gen(function* () {
        const result = yield* provider.resolveNamed(testSource, {
          ...options,
          type: "pack",
          name: "toolkit",
          accepted: { version: "1.5.0", publisherBindingId: "hbnd_test" },
        });
        expect(result.kind).toBe("selected");
        if (result.kind !== "selected") return;
        const packRef = expectRegistryPackRef(result.ref);
        expect(packRef.version).toBe("1.5.0");
        expect(packRef.pack.dependencies).toEqual({
          "@test/skills/reviewer": "^1.0.0",
        });
      }),
    );
  });
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
          "@acme/hooks/formatter": "^1.5.0",
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
          "@acme/hooks/formatter": "^1.5.0",
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
  it.effect("fetches the requested Registry identity and extracts matching archive content", () => {
    const files = {
      "skill.json": JSON.stringify({
        owner: "@test",
        type: "skill",
        name: "my-skill",
        version: "1.0.0",
      }),
      "src/SKILL.md":
        "---\nname: my-skill\ndescription: Review source changes.\n---\n\n# Review\nExact guidance.\n",
      "src/references/checklist.md": "# Checklist\nPreserve café and Ω exactly.\n",
    };
    const archiveBytes = makeFetchArchive(files);
    let capturedArgs: Parameters<RegistryClient["getExtensionPackage"]>[0] | undefined;
    const provider = createLocalRegistrySourceHostProvider(
      createMockClient({
        getExtensionPackage: (args) => {
          capturedArgs = args;
          return Effect.succeed({ archive: archiveBytes });
        },
      }),
    );
    const ref: ExtensionRef = {
      type: "skill",
      refType: "registry",
      publisherBindingId: "hbnd_test",
      skill: {
        name: extensionName("my-skill"),
        description: Option.none(),
        metadata: Option.none(),
      },
      source: testSource,
      owner: handle("@test"),
      name: extensionName("my-skill"),
      version: exactVersion("1.0.0"),
      integrity: Option.some(sha512(archiveBytes)),
      packages: [],
    };
    return runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const fetched = yield* provider.fetch(testSource, ref);
        expect(capturedArgs).toEqual({
          owner: "@test",
          type: "skill",
          name: "my-skill",
          version: Option.some(exactVersion("1.0.0")),
        });
        for (const [relative, content] of Object.entries(files)) {
          expect(yield* fs.readFileString(nodePath.join(fetched.directory, relative))).toBe(
            content,
          );
        }
      }),
    );
  });

  it.effect("rejects changed archive bytes after a matching archive succeeds", () => {
    const original = makeFetchArchive({ "src/SKILL.md": "Original accepted guidance.\n" });
    const changed = makeFetchArchive({ "src/SKILL.md": "Changed download guidance.\n" });
    let servedArchive = original;
    const provider = createLocalRegistrySourceHostProvider(
      createMockClient({
        getExtensionPackage: () => Effect.sync(() => ({ archive: servedArchive })),
      }),
    );
    const ref: ExtensionRef = {
      type: "skill",
      refType: "registry",
      publisherBindingId: "hbnd_test",
      skill: {
        name: extensionName("my-skill"),
        description: Option.none(),
        metadata: Option.none(),
      },
      source: testSource,
      owner: handle("@test"),
      name: extensionName("my-skill"),
      version: exactVersion("1.0.0"),
      integrity: Option.some(sha512(original)),
      packages: [],
    };
    return runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const accepted = yield* provider.fetch(testSource, ref);
        expect(yield* fs.readFileString(nodePath.join(accepted.directory, "src/SKILL.md"))).toBe(
          "Original accepted guidance.\n",
        );
        servedArchive = changed;
        const result = yield* provider.fetch(testSource, ref).pipe(Effect.result);
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          expect(sourceResolutionFailureCategory(result.failure)).toBe("network");
          expect(result.failure.detail).toContain("Integrity mismatch");
        }
        expect(yield* fs.readFileString(nodePath.join(accepted.directory, "src/SKILL.md"))).toBe(
          "Original accepted guidance.\n",
        );
      }),
    );
  });

  it.effect("fetches all MCP Registry coordinates and extracts the selected content", () => {
    const files = {
      "mcp.json": JSON.stringify({
        owner: "@test",
        type: "mcp-server",
        name: "my-server",
        version: "2.0.0",
      }),
      "README.md": "The selected MCP package.\n",
    };
    const archive = makeFetchArchive(files);
    let capturedArgs: Parameters<RegistryClient["getExtensionPackage"]>[0] | undefined;
    const provider = createLocalRegistrySourceHostProvider(
      createMockClient({
        getExtensionPackage: (args) => {
          capturedArgs = args;
          return Effect.succeed({ archive });
        },
      }),
    );
    const ref: ExtensionRef = {
      type: "mcp-server",
      refType: "registry",
      publisherBindingId: "hbnd_test",
      server: { name: extensionName("my-server") },
      source: testSource,
      owner: handle("@test"),
      name: extensionName("my-server"),
      version: exactVersion("2.0.0"),
      integrity: Option.some(sha512(archive)),
      packages: [],
    };
    return runEffect(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const fetched = yield* provider.fetch(testSource, ref);
        expect(capturedArgs).toEqual({
          owner: "@test",
          type: "mcp-server",
          name: "my-server",
          version: Option.some(exactVersion("2.0.0")),
        });
        for (const [relative, content] of Object.entries(files)) {
          expect(yield* fs.readFileString(nodePath.join(fetched.directory, relative))).toBe(
            content,
          );
        }
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
          expect(sourceResolutionFailureCategory(result.failure)).toBe("internal");
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

      publisherBindingId: "hbnd_test",
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
          expect(sourceResolutionFailureCategory(result.failure)).toBe("internal");
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
