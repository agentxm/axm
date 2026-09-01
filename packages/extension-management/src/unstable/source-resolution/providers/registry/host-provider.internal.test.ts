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
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";
import { describe, expect, it } from "@effect/vitest";
import { strToU8, zipSync } from "fflate";

import { makeAppError } from "../../../app-error/index.js";
import type {
  RegistryClient,
  RegistryExtensionManifest,
  GetExtensionsByOwnerArgs,
  GetExtensionsByOwnerResponse,
} from "../../../registry/index.js";
import type { VersionEntry } from "@agentxm/registry-protocol/unstable/registry";
import { ReleaseAgeExcludePatternSchema } from "@agentxm/extension-model/unstable/extensions";
import { type ExtensionRef } from "../../../workspace/refs/extension-ref.js";
import {
  PUBLICATION_SET_CONTRACT,
  publicationSetDigest,
} from "@agentxm/registry-protocol/unstable/registry";
import type { RegistrySkillRef } from "../../../workspace/refs/skill.js";
import type { RegistryMcpServerRef } from "../../../workspace/refs/mcp-server.js";
import type { RegistryPackRef } from "../../../workspace/refs/pack.js";
import type { RegistrySubagentRef } from "../../../workspace/refs/subagent.js";
import type { RegistrySource } from "@agentxm/extension-model/unstable/sources/types";
import type { FindOptions } from "../../../workspace/source-host-provider.js";
import { makeAxmSkillCompatibilityPolicyLayer } from "../../../skills/index.js";
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

const makeAxmSkillArchive = (version: string, range = version): Uint8Array =>
  zipSync({
    "skill.json": strToU8(
      JSON.stringify({ owner: "@agentxm", type: "skill", name: "axm", version }),
    ),
    "src/SKILL.md": strToU8(
      `---\nname: axm\ndescription: AXM guidance\nmetadata:\n  axm.sh/cli-version: "${version}"\n  axm.sh/cli-version-range: "${range}"\n---\n`,
    ),
  });

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
      makeAppError({
        code: "internal",
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
    Effect.fail(makeAppError({ code: "internal", detail: "not implemented" })),
  updateExtensionVisibility: () =>
    Effect.fail(makeAppError({ code: "internal", detail: "not implemented" })),
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
  getExactExtensionVersion: () =>
    Effect.fail(makeAppError({ code: "internal", detail: "remote registry not yet supported" })),
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
  previewExtensionPublishes: () =>
    Effect.fail(makeAppError({ code: "internal", detail: "not implemented" })),
  getExtensionVisibility: () =>
    Effect.fail(makeAppError({ code: "internal", detail: "not implemented" })),
  updateExtensionVisibility: () =>
    Effect.fail(makeAppError({ code: "internal", detail: "not implemented" })),
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

  it.effect("selects the newest compatible official AXM skill candidate", () => {
    const older = makeAxmSkillArchive("1.0.0");
    const newer = makeAxmSkillArchive("2.0.0");
    const probes: string[] = [];
    const provider = createRemoteRegistrySourceHostProvider(
      createMockClient({
        getExtensionIndex: () =>
          Effect.succeed(
            Option.some({
              owner: handle("@agentxm"),
              type: "skill",
              name: extensionName("axm"),
              publisherBindingId: "hbnd_agentxm",
              deprecation: null,
              versions: [
                makeVersionEntry({ version: "1.0.0", integrity: sha512(older) }),
                makeVersionEntry({ version: "2.0.0", integrity: sha512(newer) }),
              ],
            }),
          ),
        getExtensionPackage: (args) => {
          const version = Option.getOrThrow(args.version);
          probes.push(`${version}:${args.usagePurpose ?? "install"}`);
          return Effect.succeed({ archive: version === "2.0.0" ? newer : older });
        },
      }),
    );

    return runEffect(
      provider
        .resolveNamed(testSource, {
          ...options,
          owner: handle("@agentxm"),
          name: "axm",
        })
        .pipe(
          Effect.tap((result) =>
            Effect.sync(() => {
              expect(result.kind).toBe("selected");
              if (result.kind === "selected") expect(result.ref.version).toBe("1.0.0");
              expect(probes).toEqual(["2.0.0:verification", "1.0.0:verification"]);
            }),
          ),
          Effect.provide(makeAxmSkillCompatibilityPolicyLayer("1.0.0")),
        ),
    );
  });

  it.effect(
    "reports a compatible held AXM skill when mature history is incompatible or unavailable",
    () => {
      const unavailable = makeAxmSkillArchive("0.5.0");
      const mature = makeAxmSkillArchive("1.0.0");
      const held = makeAxmSkillArchive("2.0.0");
      const probes: string[] = [];
      const provider = createRemoteRegistrySourceHostProvider(
        createMockClient({
          getExtensionIndex: () =>
            Effect.succeed(
              Option.some({
                owner: handle("@agentxm"),
                type: "skill",
                name: extensionName("axm"),
                publisherBindingId: "hbnd_agentxm",
                deprecation: null,
                versions: [
                  makeVersionEntry({ version: "0.5.0", integrity: sha512(unavailable) }),
                  makeVersionEntry({ version: "1.0.0", integrity: sha512(mature) }),
                  makeVersionEntry({
                    version: "2.0.0",
                    published: "2025-01-02T12:00:00Z",
                    integrity: sha512(held),
                  }),
                ],
              }),
            ),
          getExtensionPackage: (args) => {
            const version = Option.getOrThrow(args.version);
            probes.push(`${version}:${args.usagePurpose ?? "install"}`);
            return version === "0.5.0"
              ? Effect.fail(
                  makeAppError({ code: "not_found", detail: "Historical archive is unavailable" }),
                )
              : Effect.succeed({ archive: version === "2.0.0" ? held : mature });
          },
        }),
      );

      return runEffect(
        provider
          .resolveNamed(testSource, {
            ...options,
            owner: handle("@agentxm"),
            name: "axm",
          })
          .pipe(
            Effect.tap((result) =>
              Effect.sync(() => {
                expect(result).toEqual({
                  kind: "policy_held",
                  target: "@agentxm/skills/axm",
                  candidate: {
                    version: "2.0.0",
                    publishedAt: "2025-01-02T12:00:00.000Z",
                    eligibleAt: "2025-01-03T12:00:00.000Z",
                    minimumReleaseAgeSeconds: 86_400,
                  },
                });
                expect(probes).toEqual([
                  "1.0.0:verification",
                  "0.5.0:verification",
                  "2.0.0:verification",
                ]);
              }),
            ),
            Effect.provide(makeAxmSkillCompatibilityPolicyLayer("2.0.0")),
          ),
      );
    },
  );

  it.effect("rejects an exact incompatible official AXM skill release", () => {
    const archive = makeAxmSkillArchive("2.0.0");
    const provider = createRemoteRegistrySourceHostProvider(
      createMockClient({
        getExtensionIndex: () =>
          Effect.succeed(
            Option.some({
              owner: handle("@agentxm"),
              type: "skill",
              name: extensionName("axm"),
              publisherBindingId: "hbnd_agentxm",
              deprecation: null,
              versions: [makeVersionEntry({ version: "2.0.0", integrity: sha512(archive) })],
            }),
          ),
        getExtensionPackage: () => Effect.succeed({ archive }),
      }),
    );

    return runEffect(
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          provider.resolveNamed(testSource, {
            ...options,
            owner: handle("@agentxm"),
            name: "axm",
            versionRange: Option.some("2.0.0"),
          }),
        );
        expect(error.code).toBe("conflict");
        expect(error.detail).toContain("outside the official AXM skill range");
        expect(error.suggestions).toContainEqual({
          description: "Converge to AXM CLI 2.0.0 + official AXM skill 2.0.0",
          cmd: "axm upgrade",
        });
      }).pipe(Effect.provide(makeAxmSkillCompatibilityPolicyLayer("1.0.0"))),
    );
  });

  it.effect("reports recovery when no compatible ranged AXM skill exists", () => {
    const archive = makeAxmSkillArchive("2.0.0");
    const provider = createRemoteRegistrySourceHostProvider(
      createMockClient({
        getExtensionIndex: () =>
          Effect.succeed(
            Option.some({
              owner: handle("@agentxm"),
              type: "skill",
              name: extensionName("axm"),
              publisherBindingId: "hbnd_agentxm",
              deprecation: null,
              versions: [makeVersionEntry({ version: "2.0.0", integrity: sha512(archive) })],
            }),
          ),
        getExtensionPackage: () => Effect.succeed({ archive }),
      }),
    );

    return runEffect(
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          provider.resolveNamed(testSource, {
            ...options,
            owner: handle("@agentxm"),
            name: "axm",
            versionRange: Option.some("^2.0.0"),
          }),
        );
        expect(error.code).toBe("conflict");
        expect(error.suggestions).toContainEqual({
          description: "Converge to AXM CLI 3.0.0 + official AXM skill 3.0.0",
          cmd: "axm skills install @agentxm/skills/axm --bundled --preview",
        });
      }).pipe(Effect.provide(makeAxmSkillCompatibilityPolicyLayer("3.0.0"))),
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
        // it should be a validation failure from the invalid archive payload,
        // not an integrity or transport failure.
        if (result._tag === "Failure") {
          expect(result.failure.code).toBe("validation");
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

      publisherBindingId: "hbnd_test",
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
  it.effect("routes official AXM skill find through compatibility-aware selection", () => {
    const archive = makeAxmSkillArchive("1.0.0");
    let scopeReads = 0;
    const provider = createRemoteRegistrySourceHostProvider(
      createMockClient({
        getExtensionsByScope: () => {
          scopeReads += 1;
          return Effect.succeed(toResult([]));
        },
        getExtensionIndex: () =>
          Effect.succeed(
            Option.some({
              owner: handle("@agentxm"),
              type: "skill",
              name: extensionName("axm"),
              publisherBindingId: "hbnd_agentxm",
              deprecation: null,
              versions: [makeVersionEntry({ version: "1.0.0", integrity: sha512(archive) })],
            }),
          ),
        getExtensionPackage: () => Effect.succeed({ archive }),
      }),
    );

    return runEffect(
      Effect.gen(function* () {
        const refs = yield* provider.find(
          { ...testSource, owner: Option.some(handle("@agentxm")) },
          {
            ...defaultFindOptions,
            names: ["axm"],
            owner: Option.none(),
          },
        );
        expect(refs.map((ref) => (ref.refType === "registry" ? ref.version : null))).toEqual([
          "1.0.0",
        ]);
        expect(scopeReads).toBe(0);
      }).pipe(Effect.provide(makeAxmSkillCompatibilityPolicyLayer("1.0.0"))),
    );
  });

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
