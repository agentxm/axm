import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { RegistrySource } from "@agentxm/extension-model/unstable/sources/types";
import { CredentialStore } from "@agentxm/registry-access/credentials";
import { RegistryUrl } from "@agentxm/registry-client";
import {
  SourceHostProviders,
  type SourceHostProvidersService,
} from "../../resolution/sources/index.js";
import { ExtensionLifecycleFailed } from "../errors.js";
import { makeLifecycleFixture } from "../testing.js";
import { makeInstallWorld } from "./test-helpers.js";
import {
  discoverInstallRefs,
  parseLocatorInstallRequest,
  parseRegistryQualifiedInstallRequest,
  type SourceInstallType,
} from "./request.js";

const registry: RegistrySource = {
  type: "registry",
  name: "test",
  location: new URL("https://registry.example.test"),
  owner: Option.none(),
};

const emptyProviders: SourceHostProvidersService = {
  find: () => Effect.succeed([]),
  resolveNamedRegistry: () => Effect.die("not used"),
  fetch: () => Effect.die("not used"),
  acquireForTransition: () => Effect.die("not used"),
  cloneUrl: () => Option.none(),
  origin: (source) => source.type,
};

const noCredentials = {
  tier: "restricted-file" as const,
  allowsPersistedCredentials: true,
  withRefreshLock: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
  load: () => Effect.succeed(Option.none()),
  reload: () => Effect.succeed(Option.none()),
  save: () => Effect.void,
  clear: () => Effect.void,
};

const types: ReadonlyArray<readonly [SourceInstallType, string]> = [
  ["hook", "No hooks packages found in source"],
  ["rule", "No rules found in source"],
  ["knowledge", "No knowledge bundles found in source"],
  ["skill", "No skills found in source"],
  ["subagent", "No subagents found in source"],
];

describe("source-backed install requests", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("routes local skill and subagent locators without names", () =>
    Effect.gen(function* () {
      const fixture = makeLifecycleFixture({ settings: { agents: [] } });
      cleanups.push(fixture.cleanup);
      for (const type of ["skill", "subagent"] as const) {
        const parsed = yield* fixture.provide(
          parseLocatorInstallRequest(type, { source: "./extensions", names: [] }),
        );
        expect(parsed.source.type).toBe("local");
        expect(parsed.names).toEqual([]);
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("routes an SCP address for skills and refuses it for subagents", () =>
    Effect.gen(function* () {
      const fixture = makeLifecycleFixture({ settings: { agents: [] } });
      cleanups.push(fixture.cleanup);
      const source = "git@github.com:acme/extensions.git";
      const skill = yield* fixture.provide(
        parseLocatorInstallRequest("skill", { source, names: [] }),
      );
      expect(skill.source.type).toBe("git");
      const failure = yield* fixture.provide(
        parseLocatorInstallRequest("subagent", { source, names: [] }).pipe(Effect.flip),
      );
      expect(failure).toBeInstanceOf(ExtensionLifecycleFailed);
      if (!(failure instanceof ExtensionLifecycleFailed)) return;
      expect(failure.category).toBe("usage");
      expect(failure.detail).toContain("git-scp-address");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("routes qualified skill and subagent names through the configured registry", () =>
    Effect.gen(function* () {
      const world = makeInstallWorld();
      cleanups.push(world.cleanup);
      world.registry.writeSkill("review", [{ version: "1.0.0", body: "Review." }]);
      world.registry.writeSubagent("review", [{ version: "1.0.0", body: "Review." }]);
      for (const type of ["skill", "subagent"] as const) {
        const plural = type === "skill" ? "skills" : "subagents";
        const parsed = yield* world.workspace.provide(
          parseLocatorInstallRequest(type, {
            source: `@acme/${plural}/review`,
            names: [],
          }),
        );
        expect(parsed.source.type).toBe("registry");
        expect(parsed.names).toEqual(["review"]);
        expect(Option.isSome(parsed.owner)).toBe(true);
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("keeps the per-kind empty-result sentence and offers a next step", () =>
    Effect.gen(function* () {
      const fixture = makeLifecycleFixture({ settings: { agents: [] } });
      cleanups.push(fixture.cleanup);
      for (const [type, sentence] of types) {
        const failure = yield* fixture.provide(
          discoverInstallRefs(type, {
            source: registry,
            names: ["missing"],
            owner: Option.none(),
            versionRange: Option.none(),
            resolutionProbes: [],
          }).pipe(
            Effect.provideService(SourceHostProviders, emptyProviders),
            Effect.provideService(CredentialStore, noCredentials),
            Effect.provideService(RegistryUrl, registry.location.href),
            Effect.flip,
          ),
        );
        expect(failure).toBeInstanceOf(ExtensionLifecycleFailed);
        if (!(failure instanceof ExtensionLifecycleFailed)) continue;
        expect(failure.category).toBe("not_found");
        expect(failure.detail).toBe(sentence);
        expect(failure.suggestions).toEqual(
          expect.arrayContaining([expect.objectContaining({ cmd: "axm login" })]),
        );
      }
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("parses a qualified hook request with its name and owner", () =>
    Effect.gen(function* () {
      const world = makeInstallWorld();
      cleanups.push(world.cleanup);
      const parsed = yield* world.workspace.provide(
        parseRegistryQualifiedInstallRequest("hook", "@acme/hooks/name@^1"),
      );
      expect(parsed.source.type).toBe("registry");
      expect(parsed.names).toEqual(["name"]);
      expect(Option.isSome(parsed.owner)).toBe(true);
      expect(Option.isSome(parsed.versionRange)).toBe(true);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
