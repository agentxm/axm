import { describe, expect, it, vi } from "@effect/vitest";
import { toAppError } from "../app-error/conversions.js";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { ExtensionRef } from "../workspace/refs/extension-ref.js";
import { evaluateSourceAuthority } from "../extensions/index.js";
import { computeSourceHash } from "../workspace/rendered-files.js";
import { ReleaseAgeExcludePatternSchema } from "@agentxm/extension-model/unstable/extensions";
import type { RegistrySkillRef } from "../workspace/refs/skill.js";
import type { SourceHostProvidersService } from "../source-resolution/index.js";
import { exactVersion, extensionName, handle, versionRange } from "../test-helpers.js";
import type { RegistryPackRef, WorkspacePackRef } from "../workspace/refs/pack.js";
import {
  resolvePackDependencies,
  resolvePackDependenciesWithReleaseAge,
} from "./dependency-resolution.js";

const registrySource = {
  type: "registry" as const,
  name: "agentxm",
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

const workspacePackRef = (dependencies: Readonly<Record<string, string>>): WorkspacePackRef => {
  const name = extensionName("toolkit");
  return {
    type: "pack",
    refType: "workspace",
    pack: {
      name,
      dependencies: Object.fromEntries(
        Object.entries(dependencies).map(([fqn, constraint]) => [fqn, versionRange(constraint)]),
      ),
    },
    source: {
      type: "workspace",
      owner: handle("@acme"),
      extensionType: "pack",
      name,
    },
    owner: handle("@acme"),
    name,
    version: exactVersion("1.0.0"),
    scope: "project",
    location: "file:///workspace/agent_extensions/@acme/packs/toolkit",
    sourceHash: computeSourceHash("workspace-toolkit"),
  };
};

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
    location: "file:///workspace/agent_extensions/@acme/skills/review",
    sourceHash: computeSourceHash("workspace-review"),
    skill: { name, description: Option.none(), metadata: Option.none() },
  };
};

const registrySkill = (
  owner = handle("@acme"),
  name = extensionName("release"),
): RegistrySkillRef => {
  return {
    type: "skill",
    refType: "registry",
    source: registrySource,
    owner,
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
                ? { kind: "selected", ref: workspaceSkill("1.4.0") }
                : { kind: "absent" },
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
          () => Effect.succeed({ kind: "selected", ref: workspaceSkill("1.4.0") }),
        ).pipe(Effect.flip);

        expect(toAppError(error).detail).toContain("@acme/skills/review@1.4.0");
        expect(toAppError(error).detail).toContain("^2.0.0");
        expect(toAppError(error).suggestions).toEqual([
          {
            description:
              "Update the pack if its owner has published a constraint that includes the workspace version",
            cmd: "axm update @acme/packs/toolkit",
          },
          {
            description: "Otherwise stop workspace authority from shadowing @acme/skills/review",
          },
        ]);
        expect(find).not.toHaveBeenCalled();
      }),
  );

  it.effect("points an authored pack at its runnable constraint repair", () =>
    Effect.gen(function* () {
      const error = yield* resolvePackDependencies(
        workspacePackRef({ "@acme/skills/review": "^2.0.0" }),
        providers(() => Effect.die("Registry fallback must not run")),
        undefined,
        undefined,
        () => Effect.succeed({ kind: "selected", ref: workspaceSkill("1.4.0") }),
      ).pipe(Effect.flip);

      expect(toAppError(error).detail).toContain(
        "Workspace-authored pack @acme/packs/toolkit requires @acme/skills/review@^2.0.0",
      );
      expect(toAppError(error).suggestions).toEqual([
        {
          description: "Replace the authored pack constraint with the current workspace version",
          cmd: "axm packs add @acme/packs/toolkit @acme/skills/review",
        },
      ]);
    }),
  );

  it.effect("propagates a workspace authority blocker without Registry fallback", () =>
    Effect.gen(function* () {
      const find = vi.fn(() => Effect.succeed([registrySkill()]));
      const error = yield* resolvePackDependencies(
        packRef({ "@acme/skills/review": "^1.0.0" }),
        providers(find),
        undefined,
        undefined,
        () => {
          const decision = evaluateSourceAuthority({
            target: {
              type: "skill",
              name: "review",
              identity: "@acme/skills/review",
            },
            relationship: { kind: "member", root: "@acme/packs/toolkit" },
            requested: {
              identity: "registry:@acme/skills/review",
              workspace: false,
            },
            configured: {
              identity: "workspace:@acme/skills/review",
              workspace: true,
              version: "1.4.0",
              status: "locally-modified",
            },
            requiredVersionRange: "^1.0.0",
          });
          return decision.kind === "blocked"
            ? Effect.succeed(decision)
            : Effect.die("expected blocked workspace authority");
        },
      ).pipe(Effect.flip);

      expect(toAppError(error).detail).toContain("locally-modified");
      expect(toAppError(error).suggestions).toEqual([
        {
          description:
            "Repair or explicitly remove the locally-modified workspace dependency before installing the pack.",
        },
      ]);
      expect(find).not.toHaveBeenCalled();
    }),
  );

  it.effect("uses an authorized immutable dependency without Registry selection", () =>
    Effect.gen(function* () {
      const find = vi.fn(() => Effect.die("Registry selection must not run"));
      const resolver = vi.fn(() => Effect.succeed(registrySkill()));
      const resolved = yield* resolvePackDependencies(
        packRef({ "@acme/skills/release": "^2.0.0" }),
        providers(find),
        undefined,
        undefined,
        undefined,
        resolver,
      );

      expect(resolved.resolvedSkills["@acme/skills/release"]).toMatchObject({
        source: "registry",
        version: "2.1.0",
      });
      expect(resolver).toHaveBeenCalledWith({
        owner: "@acme",
        type: "skill",
        name: "release",
        constraint: "^2.0.0",
        root: "@acme/packs/toolkit",
      });
      expect(find).not.toHaveBeenCalled();
    }),
  );

  it.effect("rejects an authorized immutable dependency outside the Pack constraint", () =>
    Effect.gen(function* () {
      const error = yield* resolvePackDependencies(
        packRef({ "@acme/skills/release": "^3.0.0" }),
        providers(() => Effect.die("Registry selection must not run")),
        undefined,
        undefined,
        undefined,
        () => Effect.succeed(registrySkill()),
      ).pipe(Effect.flip);

      expect(toAppError(error).code).toBe("conflict");
      expect(toAppError(error).detail).toContain("@acme/skills/release@2.1.0");
      expect(toAppError(error).detail).toContain("^3.0.0");
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

  it.effect("preserves the same authority-correct conflict in the release-age path", () =>
    Effect.gen(function* () {
      const error = yield* resolvePackDependenciesWithReleaseAge(
        workspacePackRef({ "@acme/skills/review": "^2.0.0" }),
        namedProviders(() => Effect.die("Registry fallback must not run")),
        evaluation,
        undefined,
        () => Effect.succeed({ kind: "selected", ref: workspaceSkill("1.4.0") }),
      ).pipe(Effect.flip);

      expect(toAppError(error).suggestions).toEqual([
        {
          description: "Replace the authored pack constraint with the current workspace version",
          cmd: "axm packs add @acme/packs/toolkit @acme/skills/review",
        },
      ]);
    }),
  );

  it.effect(
    "bypasses Registry and release-age selection for an accepted immutable dependency",
    () =>
      Effect.gen(function* () {
        const resolver = vi.fn(() => Effect.succeed(registrySkill()));
        const resolved = yield* resolvePackDependenciesWithReleaseAge(
          packRef({ "@acme/skills/release": "^2.0.0" }),
          namedProviders(() => Effect.die("Registry selection must not run")),
          evaluation,
          undefined,
          undefined,
          resolver,
        );

        expect(resolved).toMatchObject({
          kind: "selected",
          holdbacks: [],
          bypasses: [],
          dependencies: {
            resolvedSkills: {
              "@acme/skills/release": { source: "registry", version: "2.1.0" },
            },
          },
        });
        expect(resolver).toHaveBeenCalledOnce();
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
            kind: "exempted",
            target: `${options.owner}/skills/${options.name}`,
            ref: registrySkill(),
            exemption: { bypassCause: "ignore-flag" },
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

  it.effect("grants an excluded pack's exemption to its whole dependency graph", () =>
    Effect.gen(function* () {
      const resolved = yield* resolvePackDependenciesWithReleaseAge(
        packRef({ "@vendor/skills/release": "^2.0.0" }),
        namedProviders((_source, options) => {
          expect(options.releaseAgeEvaluation.grantedExemption).toEqual({
            bypassCause: "exclude",
            exemptionScope: "project",
          });
          return Effect.succeed({
            kind: "exempted",
            target: `${options.owner}/skills/${options.name}`,
            ref: registrySkill(options.owner, extensionName(options.name)),
            exemption: { bypassCause: "exclude", exemptionScope: "project" },
            bypassed: {
              version: "2.1.0",
              publishedAt: "2026-08-11T12:00:00.000Z",
              eligibleAt: "2026-08-12T12:00:00.000Z",
              minimumReleaseAgeSeconds: 86_400,
            },
          });
        }),
        {
          ...evaluation,
          exclude: [
            {
              pattern: Schema.decodeUnknownSync(ReleaseAgeExcludePatternSchema)(
                "@acme/packs/toolkit",
              ),
              scope: "project",
            },
          ],
        },
      );

      expect(resolved).toMatchObject({
        kind: "selected",
        holdbacks: [],
        bypasses: [
          {
            target: "@vendor/skills/release",
            dependencyPath: ["@acme/packs/toolkit", "@vendor/skills/release"],
            bypassCause: "exclude",
            exemptionScope: "project",
          },
        ],
      });
    }),
  );
});
