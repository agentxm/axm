/**
 * Unit tests for buildSkillInstallPlan.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type { SkillsLockMap } from "../../../lockfile/index.js";
import {
  SourceHostProviders,
  type LocalSkillRef,
  type RegistrySkillRef,
  type Source,
  type SourceHostProvidersService,
} from "../../../sources/index.js";
import { Workspace, type WorkspaceContextService } from "../../../workspace/index.js";
import { makeOutputTestLayer } from "../../../output/index.js";
import { CliEnvConfig } from "../../../config/index.js";
import { buildSkillInstallPlan } from "./plan.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeLocalSkillRef = (name: string) =>
  ({
    type: "skill",
    refType: "local",
    skill: { name, description: Option.some(`${name} skill`), metadata: Option.none() },
    source: { type: "local", path: "/fake" },
    location: `file:///fake/${name}`,
  }) satisfies LocalSkillRef;

const makeRegistrySkillRef = (name: string) =>
  ({
    type: "skill",
    refType: "registry",
    skill: { name, description: Option.some(`${name} skill`), metadata: Option.none() },
    source: {
      type: "registry",
      location: new URL("https://registry.example.com"),
      profile: Option.none(),
    },
    profile: "@acme",
    name,
    version: "1.2.3",
    integrity: "sha512-deadbeef",
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
  versionConstraint = Option.none<string>(),
  source = testSource,
}: {
  readonly selectedSkills: ReadonlyArray<LocalSkillRef | RegistrySkillRef>;
  readonly lockedSkills: SkillsLockMap;
  readonly force?: boolean;
  readonly versionConstraint?: Option.Option<string>;
  readonly source?: Source;
}) => {
  const workspaceMock = {
    getLockedSkills: () => Effect.succeed(lockedSkills),
  };
  const sourceProvidersMock = {
    origin: (s: Source) => (s.type === "local" ? s.path : "origin"),
  };

  // Provide all required services (FileSystem/Path/Log only needed inside run closures, not plan construction)
  const [outputTestLayer] = makeOutputTestLayer();
  const testLayer = Layer.mergeAll(
    outputTestLayer,
    Layer.succeed(FileSystem.FileSystem, {} as FileSystem.FileSystem),
    Layer.succeed(Path.Path, {} as Path.Path),
    CliEnvConfig.testDefaults,
  );

  return Effect.runSync(
    buildSkillInstallPlan({
      selectedSkills,
      source,
      force,
      versionConstraint,
    }).pipe(
      // Assertion needed: test only uses getLockedSkills from Workspace service.
      Effect.provideService(Workspace, workspaceMock as unknown as WorkspaceContextService),
      // Assertion needed: test only uses origin from SourceHostProviders service.
      Effect.provideService(
        SourceHostProviders,
        sourceProvidersMock as unknown as SourceHostProvidersService,
      ),
      Effect.provide(testLayer),
    ),
  );
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("buildSkillInstallPlan", () => {
  it("sets default plan name and source-based description", () => {
    const plan = runBuildPlan({
      selectedSkills: [makeLocalSkillRef("commit")],
      lockedSkills: {},
    });

    expect(plan.name).toBe("Install skill(s)");
    expect(plan.description).toEqual(Option.some("Install skills from /fake"));
  });

  it("marks new skills as ready with run closure", () => {
    const plan = runBuildPlan({
      selectedSkills: [makeLocalSkillRef("commit")],
      lockedSkills: {},
    });

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.steps).toHaveLength(1);
    const step = plan.jobs[0]!.steps[0]!;
    expect(step.readiness).toBe("ready");
    expect(step.label).toBe("commit");
    expect("run" in step).toBe(true);
  });

  it("marks already-installed skills as ready no-op", () => {
    const plan = runBuildPlan({
      selectedSkills: [makeLocalSkillRef("commit")],
      lockedSkills: lockfileWith("commit"),
    });

    const step = plan.jobs[0]!.steps[0]!;
    expect(step.readiness).toBe("ready");
    // No-op run closure returns "already installed" when executed
    if (step.readiness === "ready") {
      const result = Effect.runSync(step.run);
      expect(result.result).toBe("success");
      expect(result.message).toContain("already installed");
    }
  });

  it("creates a single serial job", () => {
    const plan = runBuildPlan({
      selectedSkills: [makeLocalSkillRef("a"), makeLocalSkillRef("b")],
      lockedSkills: {},
    });

    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0]!.concurrency).toBe(1);
  });

  it("marks already-installed skills as ready with run closure when force is true", () => {
    const plan = runBuildPlan({
      selectedSkills: [makeLocalSkillRef("commit")],
      lockedSkills: lockfileWith("commit"),
      force: true,
    });

    const step = plan.jobs[0]!.steps[0]!;
    expect(step.readiness).toBe("ready");
    expect("run" in step).toBe(true);
  });

  it("produces steps with correct labels matching skill names", () => {
    const plan = runBuildPlan({
      selectedSkills: [makeLocalSkillRef("local-skill"), makeRegistrySkillRef("registry-skill")],
      lockedSkills: {},
      versionConstraint: Option.some("^1.2.3"),
    });

    const localStep = plan.jobs[0]!.steps[0]!;
    const registryStep = plan.jobs[0]!.steps[1]!;

    expect(localStep.label).toBe("local-skill");
    expect(registryStep.label).toBe("registry-skill");
  });
});
