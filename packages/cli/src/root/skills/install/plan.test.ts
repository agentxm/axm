/**
 * Unit tests for buildSkillInstallPlan.
 */

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import {
  CodingAgentRepository,
  type CodingAgentRepositoryService,
} from "@axm.sh/core/unstable/agents";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { normalizeHandle } from "@axm.sh/core/unstable/extensions";
import type { VersionConstraint } from "@axm.sh/core/unstable/version-constraints";
import type { SkillsLockMap } from "@axm.sh/core/unstable/lockfile";
import type { LocalSkillRef, RegistrySkillRef } from "@axm.sh/core/unstable/skills";
import type { Source } from "@axm.sh/core/unstable/sources";
import { SourceHostProviders } from "@axm.sh/core/unstable/source-resolution";
import type { SourceHostProvidersService } from "@axm.sh/core/unstable/source-resolution";
import { Workspace } from "@axm.sh/core/unstable/workspace";
import { TestRenderer } from "@axm.sh/core/unstable/cli-renderer";
import {
  exactVersion,
  extensionName,
  makeBaseWorkspaceMock,
  versionConstraint,
} from "../../../test-stubs.js";
import { at } from "../../../test-helpers.js";
import { buildSkillInstallPlan } from "./plan.js";

const ACME = normalizeHandle("@acme");

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeLocalSkillRef = (name: string) =>
  ({
    type: "skill",
    refType: "local",
    skill: {
      name: extensionName(name),
      description: Option.some(`${name} skill`),
      metadata: Option.none(),
    },
    source: { type: "local", path: "/fake" },
    location: `file:///fake/${name}`,
  }) satisfies LocalSkillRef;

const makeRegistrySkillRef = (name: string) =>
  ({
    type: "skill",
    refType: "registry",
    skill: {
      name: extensionName(name),
      description: Option.some(`${name} skill`),
      metadata: Option.none(),
    },
    source: {
      type: "registry",
      location: new URL("https://registry.example.com"),
      owner: Option.none(),
    },
    owner: ACME,
    name: extensionName(name),
    version: exactVersion("1.2.3"),
    integrity: Option.some("sha512-deadbeef"),
  }) satisfies RegistrySkillRef;

const lockfileWith = (...names: string[]): SkillsLockMap =>
  Object.fromEntries(
    names.map((name) => [
      name,
      {
        type: "local" as const,
        path: "/installed",
        agents: [],
        installedAt: new Date(),
        updatedAt: new Date(),
      },
    ]),
  );

const testSource: Source = { type: "local", path: "/fake" };

const runBuildPlan = ({
  selectedSkills,
  lockedSkills,
  force = false,
  versionConstraint = Option.none<VersionConstraint>(),
  source = testSource,
}: {
  readonly selectedSkills: ReadonlyArray<LocalSkillRef | RegistrySkillRef>;
  readonly lockedSkills: SkillsLockMap;
  readonly force?: boolean;
  readonly versionConstraint?: Option.Option<VersionConstraint>;
  readonly source?: Source;
}) => {
  const workspaceMock = makeBaseWorkspaceMock("/tmp/axm", {
    getLockedSkills: () => Effect.succeed(lockedSkills),
  });
  const sourceProvidersMock: SourceHostProvidersService = {
    find: () => Effect.succeed([]),
    fetch: () => Effect.die("unused test fetch"),
    cloneUrl: () => Option.none(),
    origin: (s: Source) => (s.type === "local" ? s.path : "origin"),
  };

  const { layer: rendererTestLayer } = TestRenderer.make();
  const testLayer = Layer.mergeAll(NodeServices.layer, rendererTestLayer);

  return buildSkillInstallPlan({
    selectedSkills,
    source,
    force,
    versionConstraint,
  }).pipe(
    Effect.provideService(Workspace, workspaceMock),
    Effect.provideService(SourceHostProviders, sourceProvidersMock),
    Effect.provideService(CodingAgentRepository, {
      get: () => Effect.die(new Error("not implemented")),
      all: Effect.succeed([]),
      getConfiguredAgents: () => Effect.succeed([]),
      getUnknownConfiguredAgentIds: () => Effect.succeed([]),
    } satisfies CodingAgentRepositoryService),
    Effect.provide(testLayer),
  );
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("buildSkillInstallPlan", () => {
  it.effect("sets default plan name and source-based description", () =>
    Effect.gen(function* () {
      const plan = yield* runBuildPlan({
        selectedSkills: [makeLocalSkillRef("commit")],
        lockedSkills: {},
      });

      expect(plan.name).toBe("Install skill(s)");
      expect(plan.description).toEqual(Option.some("Install skills from /fake"));
    }),
  );

  it.effect("marks new skills as ready with run closure", () =>
    Effect.gen(function* () {
      const plan = yield* runBuildPlan({
        selectedSkills: [makeLocalSkillRef("commit")],
        lockedSkills: {},
      });

      expect(plan.jobs).toHaveLength(1);
      expect(at(plan.jobs, 0).steps).toHaveLength(1);
      const step = at(at(plan.jobs, 0).steps, 0);
      expect(step.readiness).toBe("ready");
      expect(step.label).toBe("commit");
      expect("run" in step).toBe(true);
    }),
  );

  it.effect("marks already-installed skills as ready no-op", () =>
    Effect.gen(function* () {
      const plan = yield* runBuildPlan({
        selectedSkills: [makeLocalSkillRef("commit")],
        lockedSkills: lockfileWith("commit"),
      });

      const step = at(at(plan.jobs, 0).steps, 0);
      expect(step.readiness).toBe("ready");
      if (step.readiness === "ready") {
        const result = yield* step.run;
        expect(result.result).toBe("success");
        expect(result.message).toContain("already installed");
      }
    }),
  );

  it.effect("creates a single serial job", () =>
    Effect.gen(function* () {
      const plan = yield* runBuildPlan({
        selectedSkills: [makeLocalSkillRef("a"), makeLocalSkillRef("b")],
        lockedSkills: {},
      });

      expect(plan.jobs).toHaveLength(1);
      expect(at(plan.jobs, 0).concurrency).toBe(1);
    }),
  );

  it.effect("marks already-installed skills as ready with run closure when force is true", () =>
    Effect.gen(function* () {
      const plan = yield* runBuildPlan({
        selectedSkills: [makeLocalSkillRef("commit")],
        lockedSkills: lockfileWith("commit"),
        force: true,
      });

      const step = at(at(plan.jobs, 0).steps, 0);
      expect(step.readiness).toBe("ready");
      expect("run" in step).toBe(true);
    }),
  );

  it.effect("produces steps with correct labels matching skill names", () =>
    Effect.gen(function* () {
      const plan = yield* runBuildPlan({
        selectedSkills: [makeLocalSkillRef("local-skill"), makeRegistrySkillRef("registry-skill")],
        lockedSkills: {},
        versionConstraint: Option.some(versionConstraint("^1.2.3")),
      });

      const localStep = at(at(plan.jobs, 0).steps, 0);
      const registryStep = at(at(plan.jobs, 0).steps, 1);

      expect(localStep.label).toBe("local-skill");
      expect(registryStep.label).toBe("registry-skill");
    }),
  );
});
