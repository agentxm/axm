/**
 * A lint run decides against the settings and lockfile its own observation
 * phase already decoded, rather than decoding the same documents again for
 * its workspace read model. Sharing holds only while that phase is active and
 * observes exactly the roots lint reads; any other run, and any document first
 * needed after the phase ended, is decoded by lint itself.
 */
import * as nodeFs from "node:fs";
import * as nodePath from "node:path";

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { afterEach } from "vitest";

import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { RegistryClientFactory } from "@agentxm/registry-client";
import type { CodingAgent } from "@agentxm/workspace-kernel/agent-adapters";
import {
  CodingAgentRepository,
  makeProjectionInvariantFact,
  ProjectionParticipants,
  WorkspaceInvariantFacts,
  type ProjectionInvariantFact,
} from "@agentxm/workspace-kernel/projection";
import { NoProjectionParticipants } from "@agentxm/workspace-kernel/projection/testing";
import { NativePlatformTest, workObservations } from "@agentxm/workspace-kernel/locations/testing";
import {
  CurrentWorkspaceReadPhase,
  DesiredStateReader,
  LOCKFILE_VERSION,
  WorkspaceLocation,
  withWorkspaceObservationReadView,
} from "@agentxm/workspace-kernel/workspace-state";

import { makeLintWorkspace } from "../testing.js";
import { lintSelectedSubjects } from "./lint-selected-subjects.js";
import { fixLintWorkspace, queryLintWorkspace, type LintSelection } from "./lint-workspace.js";

const validLock = `version = ${LOCKFILE_VERSION}\n`;

// Local lint never consults a Registry.
const UnusedRegistryClients = Layer.succeed(RegistryClientFactory, {
  authorityContext: () => Effect.die("Unexpected Registry authority lookup"),
  withReadPhase: (effect) => effect,
  invalidateReadPhase: Effect.void,
  forEndpoint: () => Effect.die("Local lint requested Registry content"),
  lifecycle: () => Effect.die("Local lint requested Registry lifecycle"),
  wire: () => Effect.die("Local lint requested Registry transport"),
});

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A real project workspace and a separate real user home. */
const workspaceWith = (options: Parameters<typeof makeLintWorkspace>[0]) => {
  const project = makeLintWorkspace(options);
  const home = makeLintWorkspace();
  cleanups.push(project.cleanup, home.cleanup);
  return { project, home: home.root };
};

type Fixture = ReturnType<typeof workspaceWith>;

const selectionFor = (
  root: string,
  userHome: string,
  options: { readonly fix?: boolean } = {},
): LintSelection => ({
  workspaceRoot: root,
  userHome,
  scope: "project",
  input: { view: "filesystem" },
  nativeView: { kind: "workspace" },
  fix: options.fix ?? false,
});

/** Ends a captured read phase on the first physical access of one path. */
interface PhaseEnd {
  readonly path: string;
  close?: () => void;
}

/** The host filesystem, ending the armed phase when `end.path` is first accessed. */
const endingFileSystem = (end: PhaseEnd | undefined) =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.map(FileSystem.FileSystem, (base): FileSystem.FileSystem =>
      end === undefined
        ? base
        : {
            ...base,
            access: (path, options) =>
              Effect.suspend(() => {
                if (path === end.path && end.close !== undefined) {
                  end.close();
                  delete end.close;
                }
                return base.access(path, options);
              }),
          },
    ),
  ).pipe(Layer.provide(NodeFileSystem.layer));

/**
 * Run one lint over the fixture's services and a recording filesystem,
 * counting only the work the run performs after service construction.
 */
const recordedLint = <A, E, R>(
  fixture: Fixture,
  run: Effect.Effect<A, E, R>,
  end?: PhaseEnd,
  participants: Layer.Layer<ProjectionParticipants> = NoProjectionParticipants,
) =>
  Effect.gen(function* () {
    const recording = yield* FileSystemRecorder;
    recording.reset();
    const observations = workObservations(false);
    const exit = yield* (
      end === undefined
        ? run
        : // Own the phase lint reuses, so the filesystem can end it mid-run.
          withWorkspaceObservationReadView(
            Effect.gen(function* () {
              const phase = yield* CurrentWorkspaceReadPhase;
              if (phase !== undefined) end.close = () => phase.close("mutation");
              return yield* run;
            }),
          )
    ).pipe(observations.provide, Effect.exit);
    const work = (kind: string) => observations.facts.filter((fact) => fact.kind === kind).length;
    return {
      exit,
      work,
      reads: (relative: string) =>
        recording.contentReads(nodePath.join(fixture.project.root, relative)),
    };
  }).pipe(
    Effect.provide(
      fixture.project.layer.pipe(
        Layer.provideMerge(
          Layer.mergeAll(
            NativePlatformTest,
            participants,
            UnusedRegistryClients,
            layerRecordingFileSystem(endingFileSystem(end)),
          ),
        ),
        Layer.provideMerge(
          ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: fixture.home } })),
        ),
      ),
    ),
  );

const query = (fixture: Fixture, root = fixture.project.root) =>
  queryLintWorkspace(selectionFor(root, fixture.home), { strict: false });

describe("lint read model documents", () => {
  it.effect("decodes the settings and lockfile once within a lint query", () => {
    const fixture = workspaceWith({ files: { "axm.lock": validLock } });
    return Effect.gen(function* () {
      const { exit, work, reads } = yield* recordedLint(fixture, query(fixture));
      expect(exit._tag).toBe("Success");
      expect(work("axm.parse.settings")).toBe(1);
      expect(work("axm.parse.lockfile")).toBe(1);
      // The observation port already shared the bytes; only decoding repeated.
      expect(reads("axm.json")).toBe(1);
      expect(reads("axm.lock")).toBe(1);
    });
  });

  it.effect("decodes for itself when it reads the workspace through a symlinked spelling", () => {
    const fixture = workspaceWith({ files: { "axm.lock": validLock } });
    const alias = `${fixture.project.root}-alias`;
    nodeFs.symlinkSync(fixture.project.root, alias, "dir");
    cleanups.push(() => nodeFs.rmSync(alias, { force: true }));
    return Effect.gen(function* () {
      const { exit, work } = yield* recordedLint(fixture, query(fixture, alias));
      expect(exit._tag).toBe("Success");
      expect(work("axm.parse.settings")).toBe(2);
      expect(work("axm.parse.lockfile")).toBe(2);
    });
  });

  it.effect("decodes a document first needed after the phase ended for itself", () => {
    const fixture = workspaceWith({ files: { "axm.lock": validLock } });
    return Effect.gen(function* () {
      const reference = yield* recordedLint(fixture, query(fixture));
      // Resolving the read model's layout follows its settings demand and
      // precedes its first lockfile demand. Every reader after the phase ends
      // decodes fresh documents; only the read model's settings cell, bound
      // while the phase was active, is the phase's.
      const { exit, work, reads } = yield* recordedLint(fixture, query(fixture), {
        path: nodePath.join(fixture.project.root, "packs"),
      });
      expect(work("axm.parse.settings")).toBe(17);
      expect(work("axm.parse.lockfile")).toBe(18);
      expect(reads("axm.json")).toBe(17);
      expect(reads("axm.lock")).toBe(18);
      expect(exit._tag).toBe("Success");
      expect(reference.exit._tag).toBe("Success");
      if (exit._tag !== "Success" || reference.exit._tag !== "Success") return;
      expect(exit.value.document).toEqual(reference.exit.value.document);
    });
  });

  it.effect("shares the documents of a fix preview that manages instruction files", () => {
    const fixture = workspaceWith({
      settings: {
        agents: ["claude-code"],
        instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
      },
      files: { "AGENTS.md": "# Workspace\n", "axm.lock": validLock },
    });
    return Effect.gen(function* () {
      const { exit, work } = yield* recordedLint(
        fixture,
        fixLintWorkspace(selectionFor(fixture.project.root, fixture.home, { fix: true }), {
          strict: false,
          preview: true,
        }),
      );
      expect(exit._tag).toBe("Success");
      // The preview's readiness check reads fresh documents after lint returns.
      expect(work("axm.parse.settings")).toBe(12);
      expect(work("axm.parse.lockfile")).toBe(12);
    });
  });

  it.effect("fails on a corrupt lockfile without decoding it again", () => {
    const fixture = workspaceWith({ files: { "axm.lock": "version = [\n" } });
    return Effect.gen(function* () {
      const { exit, work } = yield* recordedLint(fixture, query(fixture));
      expect(exit._tag).toBe("Failure");
      if (exit._tag !== "Failure") return;
      expect(String(exit.cause)).toContain("LockfileParseError");
      expect(work("axm.parse.settings")).toBe(1);
      expect(work("axm.parse.lockfile")).toBe(1);
    });
  });

  it.effect("keeps the selected-subject owner on its own documents inside a phase", () => {
    const fixture = workspaceWith({ files: { "axm.lock": validLock } });
    return Effect.gen(function* () {
      // Check's lint owner supplies no document cells: its re-reads are the
      // identity revalidation of what the assessment observed.
      const { exit, work } = yield* recordedLint(
        fixture,
        withWorkspaceObservationReadView(
          Effect.gen(function* () {
            const location = yield* WorkspaceLocation;
            const graph = yield* (yield* DesiredStateReader).graph();
            return yield* lintSelectedSubjects({
              nativeDirectoryInputs: location.nativeDirectoryInputs,
              platform: { fs: yield* FileSystem.FileSystem, path: yield* Path.Path },
              workspaceRoot: location.baseDir,
              userHome: fixture.home,
              scope: location.scope,
              desiredState: graph,
              subjects: [],
            });
          }),
        ),
      );
      expect(exit._tag).toBe("Success");
      expect(work("axm.parse.settings")).toBe(2);
      expect(work("axm.parse.lockfile")).toBe(2);
    });
  });
});

/** Counts each coding agent's native read-location resolutions by agent and kind. */
const countingAgentResolutions = () => {
  const counts = new Map<string, number>();
  const count = <A, E, R>(run: Effect.Effect<A, E, R>) =>
    run.pipe(
      Effect.updateService(CodingAgentRepository, (repository) => ({
        ...repository,
        all: Effect.map(repository.all, (agents) =>
          agents.map((agent): CodingAgent => ({
            ...agent,
            resolveNativeReadLocations: (args) =>
              Effect.suspend(() => {
                const key = `${agent.id}:${args.kind}`;
                counts.set(key, (counts.get(key) ?? 0) + 1);
                return agent.resolveNativeReadLocations(args);
              }),
          })),
        ),
      })),
    );
  return { count, resolutions: (key: string) => counts.get(key) ?? 0 };
};

describe("lint agent-output inventory", () => {
  it.effect("inventories the agents' native outputs once and reports unowned files", () => {
    const fixture = workspaceWith({
      settings: { agents: ["claude-code"] },
      files: {
        "axm.lock": validLock,
        ".claude/skills/stray/SKILL.md": "---\nname: stray\ndescription: Stray\n---\nStray\n",
        ".claude/agents/stray.md": "Stray\n",
      },
    });
    const { count, resolutions } = countingAgentResolutions();
    return Effect.gen(function* () {
      const { exit } = yield* recordedLint(fixture, count(query(fixture)));
      expect(exit._tag).toBe("Success");
      if (exit._tag !== "Success") return;
      // One resolution of each kind is the run's single agent-output inventory;
      // the others belong to lint's other native-location observations.
      expect(resolutions("claude-code:skill")).toBe(3);
      expect(resolutions("claude-code:subagent")).toBe(2);
      expect(
        exit.value.document.findings
          .filter((finding) => finding.ruleId === "workspace/managed-file-unowned")
          .map(({ message, location }) => ({ message, file: location?.file })),
      ).toEqual([
        {
          message: "Agent skill artifact has no AXM ownership proof.",
          file: ".claude/skills/stray",
        },
        {
          message: "Agent subagent file is not a declared Subagent at this path.",
          file: ".claude/agents/stray.md",
        },
      ]);
    });
  });
});

/**
 * A fact that reports nothing and calls `onRead` whenever a consumer reads its
 * observation. Freezing visits only enumerable properties, so only a rule's
 * own reading of the facts it was handed triggers it.
 */
const factObservedBy = (onRead: () => void): ProjectionInvariantFact => {
  const fact = makeProjectionInvariantFact(
    {
      unitId: "subagent:native-profile",
      path: "subagent:observed",
      present: true,
      current: true,
      expectedContributors: [],
    },
    "project",
  );
  const observation = fact.observation;
  return Object.defineProperty({ ...fact }, "observation", {
    enumerable: false,
    get: () => {
      onRead();
      return observation;
    },
  });
};

/** Counts projection-fact evaluations and the aggregate participant plans they observe. */
const countingProjectionFacts = (
  options: {
    readonly onPlans?: (count: number) => void;
    /** Called when a rule reads the facts an evaluation produced. */
    readonly onFactsRead?: () => void;
  } = {},
) => {
  let evaluations = 0;
  let plans = 0;
  const participants = Layer.succeed(ProjectionParticipants, {
    aggregates: [
      {
        units: [],
        projectionPlans: () =>
          Effect.sync(() => {
            plans += 1;
            options.onPlans?.(plans);
            return [];
          }),
      },
    ],
    subagents: Option.none(),
  });
  const count = <A, E, R>(run: Effect.Effect<A, E, R>) =>
    run.pipe(
      Effect.updateService(WorkspaceInvariantFacts, (facts) => ({
        ...facts,
        projectionFacts: Effect.suspend(() => {
          evaluations += 1;
          return facts.projectionFacts;
        }).pipe(
          Effect.map((evaluated) => {
            const onFactsRead = options.onFactsRead;
            return onFactsRead === undefined
              ? evaluated
              : [...evaluated, factObservedBy(onFactsRead)];
          }),
        ),
      })),
    );
  return { participants, count, evaluations: () => evaluations, plans: () => plans };
};

describe("lint projection facts", () => {
  it.effect("evaluates the projection facts once for every rule that reads them", () => {
    const fixture = workspaceWith({ files: { "axm.lock": validLock } });
    const counting = countingProjectionFacts();
    return Effect.gen(function* () {
      const { exit } = yield* recordedLint(
        fixture,
        counting.count(query(fixture)),
        undefined,
        counting.participants,
      );
      expect(exit._tag).toBe("Success");
      expect(counting.evaluations()).toBe(1);
      expect(counting.plans()).toBe(1);
    });
  });

  it.effect("evaluates the projection facts once in a repairing run", () => {
    const fixture = workspaceWith({ files: { "axm.lock": validLock } });
    const counting = countingProjectionFacts();
    return Effect.gen(function* () {
      const { exit } = yield* recordedLint(
        fixture,
        counting.count(
          fixLintWorkspace(selectionFor(fixture.project.root, fixture.home, { fix: true }), {
            strict: false,
          }),
        ),
        undefined,
        counting.participants,
      );
      expect(exit._tag).toBe("Success");
      expect(counting.evaluations()).toBe(1);
      expect(counting.plans()).toBe(1);
    });
  });

  it.effect("evaluates afresh for a demand after the read phase ended", () => {
    const fixture = workspaceWith({ files: { "axm.lock": validLock } });
    const end: PhaseEnd = { path: "" };
    // The first rule's facts settle inside the active phase; its own reading
    // of them ends the phase before the next rule asks.
    const counting = countingProjectionFacts({
      onFactsRead: () => {
        end.close?.();
        delete end.close;
      },
    });
    return Effect.gen(function* () {
      const { exit } = yield* recordedLint(
        fixture,
        counting.count(query(fixture)),
        end,
        counting.participants,
      );
      expect(exit._tag).toBe("Success");
      // The phase ended only once the first rule read its settled facts.
      expect(end.close).toBeUndefined();
      expect(counting.evaluations()).toBe(2);
      expect(counting.plans()).toBe(2);
    });
  });

  it.effect("does not reuse facts whose evaluation outlived the read phase", () => {
    const fixture = workspaceWith({ files: { "axm.lock": validLock } });
    const end: PhaseEnd = { path: "" };
    const counting = countingProjectionFacts({
      onPlans: (count) => {
        if (count === 1) end.close?.();
      },
    });
    return Effect.gen(function* () {
      const { exit } = yield* recordedLint(
        fixture,
        counting.count(query(fixture)),
        end,
        counting.participants,
      );
      expect(exit._tag).toBe("Success");
      expect(counting.evaluations()).toBe(2);
      expect(counting.plans()).toBe(2);
    });
  });

  it.effect("evaluates no projection facts for a view without projection rules", () => {
    const fixture = workspaceWith({ files: { "axm.lock": validLock } });
    const counting = countingProjectionFacts();
    return Effect.gen(function* () {
      const { exit } = yield* recordedLint(
        fixture,
        counting.count(
          queryLintWorkspace(
            {
              ...selectionFor(fixture.project.root, fixture.home),
              input: { view: "git-index", fingerprint: `sha256:${"0".repeat(64)}` },
            },
            { strict: false },
          ),
        ),
        undefined,
        counting.participants,
      );
      expect(exit._tag).toBe("Success");
      expect(counting.evaluations()).toBe(0);
      expect(counting.plans()).toBe(0);
    });
  });
});
