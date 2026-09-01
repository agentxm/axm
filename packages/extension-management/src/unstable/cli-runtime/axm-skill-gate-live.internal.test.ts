/**
 * Behavioral tests for the official AXM skill candidate gate, composed the
 * way the application composes it: the extension-sources registry provider
 * consumes `AxmSkillCandidateGateLive`, which renders verdicts from the
 * extension-workspace compatibility policy. These pin the end-to-end
 * selection, hold, and recovery behavior across the port seam.
 */

import { createHash } from "node:crypto";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";
import { describe, expect, it } from "@effect/vitest";
import { strToU8, zipSync } from "fflate";

import {
  RegistryOperationFailed,
  type RegistryClient,
  type RegistryExtensionManifest,
  type GetExtensionsByOwnerResponse,
} from "@agentxm/registry-client";
import type { VersionEntry } from "@agentxm/registry-protocol/unstable/registry";
import {
  PUBLICATION_SET_CONTRACT,
  publicationSetDigest,
} from "@agentxm/registry-protocol/unstable/registry";
import type { RegistrySource } from "@agentxm/extension-model/unstable/sources/types";
import type { FindOptions } from "@agentxm/extension-model/unstable/sources/source-host-provider";
import { makeAxmSkillCompatibilityPolicyLayer } from "@agentxm/extension-workspace";
import {
  AxmSkillCandidateGate,
  createRemoteRegistrySourceHostProvider,
} from "@agentxm/extension-sources";
import { AxmSkillCandidateGateLive } from "./axm-skill-gate-live.js";
import { toAppError } from "../app-error/conversions.js";
import { dependencyConstraints, exactVersion, extensionName, handle } from "../test-helpers.js";

const runEffect = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    FileSystem.FileSystem | Path.Path | AxmSkillCandidateGate | Scope.Scope
  >,
) =>
  effect.pipe(
    Effect.scoped,
    Effect.provide(Layer.merge(NodeServices.layer, AxmSkillCandidateGateLive)),
  );

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

const toResult = (
  extensions: ReadonlyArray<RegistryExtensionManifest>,
): GetExtensionsByOwnerResponse => ({
  extensions,
  total: extensions.length,
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

describe("official AXM skill gate through registry resolution", () => {
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
                  new RegistryOperationFailed({
                    category: "not_found",
                    detail: "Historical archive is unavailable",
                  }),
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
        const rendered = toAppError(error);
        expect(rendered.code).toBe("conflict");
        expect(rendered.detail).toContain("outside the official AXM skill range");
        expect(rendered.suggestions).toContainEqual({
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
        const rendered = toAppError(error);
        expect(rendered.code).toBe("conflict");
        expect(rendered.suggestions).toContainEqual({
          description: "Converge to AXM CLI 3.0.0 + official AXM skill 3.0.0",
          cmd: "axm skills install @agentxm/skills/axm --bundled --preview",
        });
      }).pipe(Effect.provide(makeAxmSkillCompatibilityPolicyLayer("3.0.0"))),
    );
  });

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
});
