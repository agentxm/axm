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
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { afterEach, vi } from "vitest";

import { CurrentWorkObserver } from "@agentxm/host-primitives/work-observation";
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
  LockfileIoError,
  LockfileReader,
  WorkspaceLocation,
  withWorkspaceObservationReadView,
  withWorkspaceReadView,
} from "@agentxm/workspace-kernel/workspace-state";

import { makeAxmSkillCompatibilityPolicyLayer } from "@agentxm/cli-maintenance/official-skill/composition";

import {
  applySyncAcceptingExecutionChanges,
  makeFileRegistry,
  makeSyncFixture,
  writeAuthoredRule,
  type SyncFixture,
} from "../../testing/sync-fixture.js";
import { makeLintWorkspace } from "../testing.js";
import { lintSelectedSubjects } from "./lint-selected-subjects.js";
import {
  fixLintWorkspace,
  queryLintWorkspace,
  type LintSelection,
  type LintWorkspaceResult,
} from "./lint-workspace.js";

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

/**
 * A synced project with one acquired Rule, Hook and Knowledge bundle, and one
 * workspace-authored Rule, whose agents' instruction files AXM does not manage
 * unless `settings` says so.
 */
const syncedContributors = (settings: Readonly<Record<string, unknown>> = {}) => {
  const registry = makeFileRegistry();
  cleanups.push(registry.cleanup);
  registry.writeRule("guide", [{ version: "1.0.0", body: "Follow the guide.\n" }]);
  registry.writeHook("audit", [{ version: "1.0.0" }]);
  registry.writeKnowledge("handbook", [
    { version: "1.0.0", body: "# Handbook\n\nTeam knowledge.\n" },
  ]);
  const workspace = makeSyncFixture({
    settings: {
      owner: "@acme",
      agents: ["claude-code"],
      sources: [registry.source],
      rules: { guide: "test:@acme/rules/guide@^1.0.0", conventions: "workspace" },
      hooks: { audit: "test:@acme/hooks/audit@^1.0.0" },
      knowledge: { handbook: "test:@acme/knowledge/handbook@^1.0.0" },
      ...settings,
    },
  });
  cleanups.push(workspace.cleanup);
  writeAuthoredRule(workspace.root, "conventions", "Follow the conventions.");
  return workspace;
};

const contributorLint = (workspace: SyncFixture) =>
  queryLintWorkspace(selectionFor(workspace.root, workspace.home), { strict: false });

/**
 * Run `lint`, counting the canonical tree digests it computes. `afterDigests`
 * runs once that many digests have been recorded.
 */
const countedDigests = <A, E, R>(
  lint: Effect.Effect<A, E, R>,
  afterDigests?: { readonly count: number; readonly run: () => void },
) =>
  Effect.gen(function* () {
    let digests = 0;
    const exit = yield* lint.pipe(
      Effect.provideService(CurrentWorkObserver, {
        record: (fact) => {
          if (fact.kind !== "axm.hash.materialized-tree") return;
          digests += 1;
          if (digests === afterDigests?.count) afterDigests.run();
        },
        detailSelected: () => false,
      }),
      Effect.exit,
    );
    return { exit, digests };
  });

const withContributorServices = <A, E, R>(workspace: SyncFixture, effect: Effect.Effect<A, E, R>) =>
  workspace
    .provide(Effect.andThen(applySyncAcceptingExecutionChanges(), effect))
    .pipe(
      Effect.provide(
        Layer.merge(NodeServices.layer, makeAxmSkillCompatibilityPolicyLayer("1.0.0")),
      ),
    );

const expectSameDocument = (
  counted: { readonly exit: Exit.Exit<LintWorkspaceResult, unknown> },
  reference: { readonly exit: Exit.Exit<LintWorkspaceResult, unknown> },
) => {
  expect(counted.exit._tag).toBe("Success");
  expect(reference.exit._tag).toBe("Success");
  if (counted.exit._tag !== "Success" || reference.exit._tag !== "Success") return;
  expect(JSON.stringify(counted.exit.value.document)).toBe(
    JSON.stringify(reference.exit.value.document),
  );
};

type ObservationHandoff = Parameters<
  NonNullable<Context.Service.Shape<typeof WorkspaceInvariantFacts>["withCanonicalObservations"]>
>[0];

/** Run `lint` with every handover of its observations passed through `wrap`. */
const wrappingHandoffs =
  (wrap: (handoff: ObservationHandoff) => ObservationHandoff) =>
  <A, E, R>(lint: Effect.Effect<A, E, R>) =>
    lint.pipe(
      Effect.updateService(WorkspaceInvariantFacts, (facts) => {
        const handOver = facts.withCanonicalObservations;
        return handOver === undefined
          ? facts
          : { ...facts, withCanonicalObservations: (handoff) => handOver(wrap(handoff)) };
      }),
    );

describe("lint contributor observations", () => {
  it.effect(
    "selects acquired Rule, Hook and Knowledge contributors from the run's own canonical observation",
    () => {
      const workspace = syncedContributors();
      return withContributorServices(
        workspace,
        Effect.gen(function* () {
          // Outside an observation phase, the facts observe every contributor
          // for themselves: one digest per acquired root for lint, one more per
          // acquired root for the facts. The authored Rule has no accepted tree.
          const reference = yield* countedDigests(
            withWorkspaceReadView(contributorLint(workspace)),
          );
          expect(reference.digests).toBe(6);
          // Inside its own observation phase, the Rule, Hook and Knowledge
          // selections take lint's observation: one digest per acquired root.
          const taken: Array<string> = [];
          const recordingTaken = wrappingHandoffs((handoff) => ({
            ...handoff,
            observed: (desired) => {
              const observed = handoff.observed(desired);
              if (Option.isSome(observed)) taken.push(`${desired.type}:${desired.name}`);
              return observed;
            },
          }));
          const counted = yield* countedDigests(recordingTaken(contributorLint(workspace)));
          expect(counted.digests).toBe(3);
          expect([...taken].sort()).toEqual([
            "hook:audit",
            "knowledge:handbook",
            "rule:conventions",
            "rule:guide",
          ]);
          expectSameDocument(counted, reference);
        }),
      );
    },
    { timeout: 60_000 },
  );

  it.effect(
    "decodes an installed Knowledge manifest once for its rule subject and inspection",
    () => {
      const workspace = syncedContributors();
      return withContributorServices(
        workspace,
        Effect.gen(function* () {
          const [manifest] = nodeFs
            .readdirSync(workspace.root, { recursive: true, encoding: "utf8" })
            .filter((entry) =>
              entry.endsWith(nodePath.join("knowledge", "handbook", "knowledge.json")),
            );
          expect(manifest).toBeDefined();
          if (manifest === undefined) return;
          const text = nodeFs.readFileSync(nodePath.join(workspace.root, manifest), "utf8");
          const parse = vi.spyOn(JSON, "parse");
          const exit = yield* Effect.exit(contributorLint(workspace));
          const parses = parse.mock.calls.filter(([input]) => input === text).length;
          parse.mockRestore();
          expect(exit._tag).toBe("Success");
          // The run's canonical observation, its read model's canonical scan and
          // the rule subject each parse the manifest; the package inspection
          // decodes the subject's text from the scan's parse.
          expect(parses).toBe(3);
        }),
      );
    },
  );

  it.effect("observes for itself once lint's observation phase has ended", () => {
    const workspace = syncedContributors();
    return withContributorServices(
      workspace,
      Effect.gen(function* () {
        const reference = yield* countedDigests(withWorkspaceReadView(contributorLint(workspace)));
        // End the phase lint reuses as soon as lint's own three observations
        // are digested, before any rule asks for the projection facts.
        let close: (() => void) | undefined;
        const counted = yield* countedDigests(
          withWorkspaceObservationReadView(
            Effect.gen(function* () {
              const phase = yield* CurrentWorkspaceReadPhase;
              close = () => phase?.close("mutation");
              return yield* contributorLint(workspace);
            }),
          ),
          { count: 3, run: () => close?.() },
        );
        // Each rule's demand evaluates its own facts after the phase ended, and
        // every selection in them observes for itself.
        expect(counted.digests).toBe(9);
        expectSameDocument(counted, reference);
      }),
    );
  });

  it.effect("takes no observation once the phase ends between two contributor selections", () => {
    const workspace = syncedContributors();
    const taken = { whileActive: 0, afterEnd: 0, handoffs: 0 };
    // A mutation through the observation port during the facts evaluation ends
    // the phase as soon as the first contributor selection takes lint's
    // observation; the facts still read through the ended phase's port.
    const endingAfterFirstSelection = wrappingHandoffs((handoff) => {
      taken.handoffs += 1;
      return {
        ...handoff,
        observed: (desired) => {
          if (handoff.phase.isActive()) taken.whileActive += 1;
          else taken.afterEnd += 1;
          handoff.phase.close("mutation");
          return handoff.observed(desired);
        },
      };
    });
    return withContributorServices(
      workspace,
      Effect.gen(function* () {
        const reference = yield* countedDigests(withWorkspaceReadView(contributorLint(workspace)));
        const counted = yield* countedDigests(
          endingAfterFirstSelection(contributorLint(workspace)),
        );
        // Only the selection that ran while the phase was active took lint's
        // observation; every later selection observed for itself.
        expect(taken).toEqual({ whileActive: 1, afterEnd: 0, handoffs: 1 });
        expectSameDocument(counted, reference);
      }),
    );
  });

  it.effect("observes for itself when the phase ends before the facts are evaluated", () => {
    // Managing the agents' instruction files makes the run's alias probe write
    // through the observation port, ending the phase before any contributor
    // selection, so every selection observes for itself.
    const workspace = syncedContributors({ instructionFiles: { fileName: "AGENTS.md" } });
    return withContributorServices(
      workspace,
      Effect.gen(function* () {
        const reference = yield* countedDigests(withWorkspaceReadView(contributorLint(workspace)));
        expect(reference.digests).toBe(6);
        const counted = yield* countedDigests(contributorLint(workspace));
        // Lint's own 3, then each of two demands evaluates afresh.
        expect(counted.digests).toBe(3 + 2 * 3);
        expectSameDocument(counted, reference);
      }),
    );
  });

  it.effect("hands over no observations when lint's own observation failed", () => {
    const workspace = syncedContributors();
    let handoffs = 0;
    // Inside an outer phase, lint's own observation reads accepted rows through
    // this reader, which cannot read the Hook's row; the facts read through the
    // phase's own readers and observe every contributor successfully.
    const countingHandoffs = wrappingHandoffs((handoff) => {
      handoffs += 1;
      return handoff;
    });
    const failingLintObservation = <A, E, R>(lint: Effect.Effect<A, E, R>) =>
      countingHandoffs(lint).pipe(
        Effect.updateService(LockfileReader, (reader) => ({
          ...reader,
          acceptedEntry: (type, name) =>
            type === "hook"
              ? Effect.fail(
                  new LockfileIoError({
                    path: nodePath.join(workspace.root, "axm.lock"),
                    cause: "unreadable",
                  }),
                )
              : reader.acceptedEntry(type, name),
        })),
      );
    return withContributorServices(
      workspace,
      Effect.gen(function* () {
        const reference = yield* countedDigests(
          withWorkspaceReadView(failingLintObservation(contributorLint(workspace))),
        );
        const counted = yield* countedDigests(
          withWorkspaceObservationReadView(failingLintObservation(contributorLint(workspace))),
        );
        expect(handoffs).toBe(0);
        expectSameDocument(counted, reference);
      }),
    );
  });
});

/** Counts the `JSON.parse` calls whose input is exactly `text` while `run` executes. */
const countingParsesOf =
  (text: () => string) =>
  <A, E, R>(run: Effect.Effect<A, E, R>) =>
    Effect.suspend(() => {
      const parse = vi.spyOn(JSON, "parse");
      return run.pipe(
        Effect.exit,
        Effect.map((exit) => ({
          exit,
          parses: parse.mock.calls.filter(([input]) => input === text()).length,
        })),
        Effect.ensuring(Effect.sync(() => parse.mockRestore())),
      );
    });

const settingsText = (fixture: Fixture) =>
  nodeFs.readFileSync(nodePath.join(fixture.project.root, "axm.json"), "utf8");

const settingsRuleIds = new Set([
  "workspace/settings-keys-recognized",
  "workspace/mcps-transport-exclusivity",
  "workspace/mcps-no-secret-literal",
]);

const mcpSettings = {
  settingsRulesParseCount: "unrecognized",
  mcpServers: {
    demo: {
      connection: { transport: "stdio", command: "node", env: { API_TOKEN: { env: "API_TOKEN" } } },
    },
  },
};

/** One selected-subject lint over the fixture inside an observation phase. */
const selectedLint = (
  fixture: Fixture,
  subjects: Parameters<typeof lintSelectedSubjects>[0]["subjects"],
) =>
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
        subjects,
      });
    }),
  );

describe("lint settings rules", () => {
  it.effect("parses the settings text once for every rule that reads its keys", () => {
    const fixture = workspaceWith({ settings: mcpSettings, files: { "axm.lock": validLock } });
    return Effect.gen(function* () {
      const { exit } = yield* recordedLint(
        fixture,
        countingParsesOf(() => settingsText(fixture))(query(fixture)),
      );
      expect(exit._tag).toBe("Success");
      if (exit._tag !== "Success") return;
      const { exit: lint, parses } = exit.value;
      expect(lint._tag).toBe("Success");
      if (lint._tag !== "Success") return;
      // The strict settings decode and one loose parse the three rules share.
      expect(parses).toBe(2);
      expect(
        lint.value.document.findings
          .filter((finding) => settingsRuleIds.has(finding.ruleId))
          .map(({ ruleId, message }) => ({ ruleId, message })),
      ).toEqual([
        {
          ruleId: "workspace/settings-keys-recognized",
          message:
            "Workspace settings has unrecognized top-level key 'settingsRulesParseCount'. The current settings schema does not recognize this key.",
        },
      ]);
    });
  });

  const selectedParses = (subjects: Parameters<typeof lintSelectedSubjects>[0]["subjects"]) => {
    const fixture = workspaceWith({ settings: mcpSettings, files: { "axm.lock": validLock } });
    return Effect.gen(function* () {
      const { exit } = yield* recordedLint(
        fixture,
        countingParsesOf(() => settingsText(fixture))(selectedLint(fixture, subjects)),
      );
      expect(exit._tag).toBe("Success");
      if (exit._tag !== "Success") return -1;
      expect(exit.value.exit._tag).toBe("Success");
      return exit.value.parses;
    });
  };

  it.effect("parses the settings text once for both rules of a selected MCP server", () =>
    Effect.gen(function* () {
      // The assessment's and the lint read model's strict decodes, and one
      // loose parse the two selected MCP rules share.
      expect(yield* selectedParses([{ type: "mcp-server", name: "demo" }])).toBe(3);
    }),
  );

  it.effect("parses the settings text for no rule when no MCP server is selected", () =>
    Effect.gen(function* () {
      // Only the assessment's and the lint read model's strict decodes.
      expect(yield* selectedParses([])).toBe(2);
    }),
  );
});
