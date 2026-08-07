import { describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ExtensionRef } from "../extensions/index.js";
import { computeSourceHash } from "../extensions/index.js";
import type { SourceHostProvidersService } from "../source-resolution/index.js";
import { exactVersion, extensionName, handle, versionRange } from "../test-helpers.js";
import type { RegistryPackRef } from "./refs.js";
import { resolvePackDependencies } from "./dependency-resolution.js";

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

const registrySkill = (): ExtensionRef => {
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
