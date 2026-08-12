import { describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Option from "effect/Option";
import type { ExtensionRef } from "../extensions/index.js";
import { computeSourceHash } from "../extensions/index.js";
import type { RegistrySkillRef } from "../skills/index.js";
import type { SourceHostProvidersService } from "../source-resolution/index.js";
import { exactVersion, extensionName, handle, versionRange } from "../test-helpers.js";
import type { RegistryPackRef } from "./refs.js";
import {
  resolvePackDependencies,
  resolvePackDependenciesWithReleaseAge,
} from "./dependency-resolution.js";

const registrySource = {
  type: "registry" as const,
  location: new URL("https://registry.agentxm.ai"),
  owner: Option.none(),
};

const packRef = (dependencies: Readonly<Record<string, string>>): RegistryPackRef => ({
  type: "pack",
  refType: "registry",
  pack: {
    name: extensionName("toolkit"),
    dependencies: Object.fromEntries(
      Object.entries(dependencies).map(([fqn, constraint]) => [fqn, versionRange(constraint)]),
    ),
  },
  source: registrySource,
  owner: handle("@acme"),
  publisherBindingId: "hbnd_pack",
  name: extensionName("toolkit"),
  version: exactVersion("1.0.0"),
  integrity: Option.some("sha512-pack"),
  packages: [],
});

const workspaceSkill = (version: string): ExtensionRef => {
  const name = extensionName("review");
  return {
    type: "skill",
    refType: "workspace",
    source: {
      type: "workspace",
      owner: handle("@acme"),
      extensionType: "skill",
      name,
    },
    owner: handle("@acme"),
    name,
    version: exactVersion(version),
    scope: "project",
    location: "file:///workspace/.axm/extensions/@acme/skills/review",
    sourceHash: computeSourceHash("workspace-review"),
    skill: { name, description: Option.none(), metadata: Option.none() },
  };
};

const registrySkill = (): RegistrySkillRef => {
  const name = extensionName("release");
  return {
    type: "skill",
    refType: "registry",
    source: registrySource,
    owner: handle("@acme"),
    publisherBindingId: "hbnd_release",
    name,
    version: exactVersion("2.1.0"),
    integrity: Option.some("sha512-release"),
    packages: [],
    skill: { name, description: Option.none(), metadata: Option.none() },
  };
};

const providers = (find: SourceHostProvidersService["find"]): SourceHostProvidersService => ({
  resolveNamedRegistry: () => Effect.die("not used"),
  find,
  fetch: () => Effect.die("unused"),
  cloneUrl: () => Option.none(),
  origin: () => "registry",
});

describe("resolvePackDependencies", () => {
  it.effect(
    "resolves a mixed workspace and Registry pack without replacing workspace authority",
    () =>
      Effect.gen(function* () {
        const find = vi.fn(() => Effect.succeed([registrySkill()]));
        const resolved = yield* resolvePackDependencies(
          packRef({
            "@acme/skills/review": "^1.0.0",
            "@acme/skills/release": "^2.0.0",
          }),
          providers(find),
          undefined,
          undefined,
          ({ type, name }) =>
            Effect.succeed(
              type === "skill" && name === "review"
                ? Option.some(workspaceSkill("1.4.0"))
                : Option.none(),
            ),
        );

        expect(resolved.resolvedSkills["@acme/skills/review"]).toMatchObject({
          source: "workspace",
          version: "1.4.0",
          sourceIdentity: "workspace:@acme/skills/review",
        });
        expect(resolved.resolvedSkills["@acme/skills/release"]).toEqual({
          source: "registry",
          version: "2.1.0",
          publisherBindingId: "hbnd_release",
          integrity: "sha512-release",
        });
        expect(find).toHaveBeenCalledTimes(1);
      }),
  );

  it.effect(
    "fails on an incompatible workspace-authoritative version without Registry fallback",
    () =>
      Effect.gen(function* () {
        const find = vi.fn(() => Effect.succeed([registrySkill()]));
        const error = yield* resolvePackDependencies(
          packRef({ "@acme/skills/review": "^2.0.0" }),
          providers(find),
          undefined,
          undefined,
          () => Effect.succeed(Option.some(workspaceSkill("1.4.0"))),
        ).pipe(Effect.flip);

        expect(error.detail).toContain("@acme/skills/review@1.4.0");
        expect(error.detail).toContain("^2.0.0");
        expect(find).not.toHaveBeenCalled();
      }),
  );
});

describe("resolvePackDependenciesWithReleaseAge", () => {
  const evaluation = {
    minimumReleaseAge: Duration.hours(24),
    evaluatedAt: DateTime.makeUnsafe("2026-08-12T00:00:00Z"),
    mode: "enforce" as const,
  };

  const namedProviders = (
    resolveNamedRegistry: SourceHostProvidersService["resolveNamedRegistry"],
  ): SourceHostProvidersService => ({
    resolveNamedRegistry,
    find: () => Effect.die("unused"),
    fetch: () => Effect.die("unused"),
    cloneUrl: () => Option.none(),
    origin: () => "registry",
  });

  it.effect("holds the complete graph and records the dependency path", () =>
    Effect.gen(function* () {
      const resolved = yield* resolvePackDependenciesWithReleaseAge(
        packRef({ "@acme/skills/release": "^2.0.0" }),
        namedProviders((_source, options) =>
          Effect.succeed({
            kind: "policy_held",
            target: `${options.owner}/skills/${options.name}`,
            requestedRange: "^2.0.0",
            candidate: {
              version: "2.1.0",
              publishedAt: "2026-08-11T12:00:00.000Z",
              eligibleAt: "2026-08-12T12:00:00.000Z",
              minimumReleaseAgeSeconds: 86_400,
            },
          }),
        ),
        evaluation,
      );

      expect(resolved).toMatchObject({
        kind: "policy_held",
        holdbacks: [
          {
            target: "@acme/skills/release",
            dependencyPath: ["@acme/packs/toolkit", "@acme/skills/release"],
            requestedRange: "^2.0.0",
            candidateVersion: "2.1.0",
          },
        ],
      });
    }),
  );

  it.effect("selects an eligible dependency while disclosing its newer held release", () =>
    Effect.gen(function* () {
      const resolved = yield* resolvePackDependenciesWithReleaseAge(
        packRef({ "@acme/skills/release": "^2.0.0" }),
        namedProviders((_source, options) =>
          Effect.succeed({
            kind: "selected",
            target: `${options.owner}/skills/${options.name}`,
            ref: registrySkill(),
            newerHeld: {
              version: "2.2.0",
              publishedAt: "2026-08-11T12:00:00.000Z",
              eligibleAt: "2026-08-12T12:00:00.000Z",
              minimumReleaseAgeSeconds: 86_400,
            },
          }),
        ),
        evaluation,
      );

      expect(resolved).toMatchObject({
        kind: "selected",
        holdbacks: [
          {
            dependencyPath: ["@acme/packs/toolkit", "@acme/skills/release"],
            selectedVersion: "2.1.0",
            candidateVersion: "2.2.0",
          },
        ],
      });
    }),
  );

  it.effect("records an explicitly bypassed dependency", () =>
    Effect.gen(function* () {
      const resolved = yield* resolvePackDependenciesWithReleaseAge(
        packRef({ "@acme/skills/release": "^2.0.0" }),
        namedProviders((_source, options) =>
          Effect.succeed({
            kind: "selected",
            target: `${options.owner}/skills/${options.name}`,
            ref: registrySkill(),
            bypassed: {
              version: "2.1.0",
              publishedAt: "2026-08-11T12:00:00.000Z",
              eligibleAt: "2026-08-12T12:00:00.000Z",
              minimumReleaseAgeSeconds: 86_400,
            },
          }),
        ),
        { ...evaluation, mode: "ignore" },
      );

      expect(resolved).toMatchObject({
        kind: "selected",
        bypasses: [
          {
            target: "@acme/skills/release",
            dependencyPath: ["@acme/packs/toolkit", "@acme/skills/release"],
            candidateVersion: "2.1.0",
          },
        ],
      });
    }),
  );
});
