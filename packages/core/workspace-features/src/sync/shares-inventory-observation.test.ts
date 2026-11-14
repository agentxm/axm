import { CurrentWorkObserver, type WorkFact } from "@agentxm/host-primitives/work-observation";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Tracer from "effect/Tracer";
import * as Context from "effect/Context";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { WorkspaceReadViews, WorkspaceRecords } from "@agentxm/workspace-kernel/workspace-state";
import { deriveOperationOutcome, previewPlanExecution } from "@agentxm/workspace-kernel/operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { SyncWorkspace } from "./sync-workspace.js";
import {
  applySync,
  makeFileRegistry,
  makeSyncFixture,
  syncRequest,
} from "../testing/sync-fixture.js";
import { writeLocalSkillPackage } from "../testing/local-packages.js";

/** Count actual graph executions, not requests served by the phase cache. */
const countPhaseReads = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  counts: { skillInventoryReads: number; graphEvaluations: number },
) =>
  Effect.gen(function* () {
    const views = yield* WorkspaceReadViews;
    const observer = yield* CurrentWorkObserver;
    return yield* effect.pipe(
      Effect.provideService(CurrentWorkObserver, {
        ...observer,
        detailSelected: observer?.detailSelected ?? (() => false),
        record: (fact, parent) => {
          if (fact.kind === "axm.resolve.desired-state-reuse")
            counts.graphEvaluations += fact.attributes["axm.work.executed"] ?? 0;
          observer?.record(fact, parent);
        },
      }),
      Effect.provideService(WorkspaceReadViews, {
        ...views,
        capture: (options) =>
          views.capture(options).pipe(
            Effect.map((context) => {
              const records = Context.get(context, WorkspaceRecords);
              return Context.add(context, WorkspaceRecords, {
                ...records,
                getExtensionInventory: (type, selection) =>
                  Effect.sync(() => {
                    if (type === "skill") counts.skillInventoryReads += 1;
                  }).pipe(Effect.andThen(records.getExtensionInventory(type, selection))),
              });
            }),
          ),
      }),
    );
  });

describe("Sync inventory observation", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("shares planning reads and performs one uncached validation read", () => {
    // Planning captures the input view once; validation evaluates once more,
    // uncached, and compares semantic identity.
    const names = ["review", "triage", "summarize"];
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        skills: Object.fromEntries(names.map((name) => [name, `./vendor/${name}`])),
      },
    });
    cleanups.push(workspace.cleanup);
    for (const name of names) writeLocalSkillPackage(workspace.root, { name });

    return workspace
      .provide(
        Effect.gen(function* () {
          const counts = { skillInventoryReads: 0, graphEvaluations: 0 };
          const spans: Tracer.NativeSpan[] = [];
          const tracer = Tracer.make({
            span(options) {
              const span = new Tracer.NativeSpan(options);
              spans.push(span);
              return span;
            },
          });
          const facts: WorkFact[] = [];
          const before = workspace.snapshot();
          const candidate = yield* countPhaseReads(
            SyncWorkspace.prepare(syncRequest()),
            counts,
          ).pipe(
            Effect.withTracer(tracer),
            Effect.provideService(CurrentWorkObserver, {
              record: (fact) => {
                facts.push(fact);
              },
              detailSelected: () => false,
            }),
          );
          expect(candidate._tag).toBe("SyncWorkspace");
          expect(counts.skillInventoryReads).toBe(2);
          expect(counts.graphEvaluations).toBe(2);
          expect(workspace.snapshot()).toEqual(before);
          expect(spans.filter((span) => span.name === "axm.hash.sync-observations")).toEqual([]);
          const observations = facts.filter((fact) => fact.kind === "axm.hash.sync-observations");
          expect(observations).toHaveLength(1);
          expect(observations[0]?.attributes["axm.work.count"]).toBe(1);
          expect(observations[0]?.attributes["axm.work.bytes"]).toBeGreaterThan(69);
          expect(observations[0]?.outcome).toBe("success");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("reuses the desired graph while resolving multiple Registry skills", () => {
    const registry = makeFileRegistry();
    cleanups.push(registry.cleanup);
    const names = ["review", "triage"];
    for (const name of names) {
      registry.writeSkill(name, [{ version: "1.0.0", body: `Initial ${name}.` }]);
    }
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        sources: [registry.source],
        skills: Object.fromEntries(names.map((name) => [name, `test:@acme/skills/${name}@^1.0.0`])),
      },
    });
    cleanups.push(workspace.cleanup);

    return workspace
      .provide(
        Effect.gen(function* () {
          const counts = { skillInventoryReads: 0, graphEvaluations: 0 };
          const candidate = yield* countPhaseReads(SyncWorkspace.prepare(syncRequest()), counts);
          expect(candidate._tag).toBe("SyncWorkspace");
          expect(counts.graphEvaluations).toBe(2);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("rechecks observed inventory before applying a prepared sync", () => {
    const names = ["review", "triage"];
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        skills: Object.fromEntries(names.map((name) => [name, `./vendor/${name}`])),
      },
    });
    cleanups.push(workspace.cleanup);
    for (const name of names) writeLocalSkillPackage(workspace.root, { name });

    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();
          workspace.remove(".claude/skills/review");
          const candidate = yield* SyncWorkspace.prepare(syncRequest());
          if (candidate._tag === "AlreadyReconciled") throw new Error("Expected a repair plan");
          yield* SyncWorkspace.previewOrApply(candidate, previewPlanExecution);
          workspace.remove(".claude/skills/triage");
          const before = workspace.snapshot();
          const result = yield* SyncWorkspace.previewOrApply(candidate, preapprovedPlanExecution);
          expect(deriveOperationOutcome(result)).toBe("blocked");
          expect(result.blocking?.class).toBe("stale-candidate");
          expect(workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  /** Two local Skills not yet materialized, so applying the prepared sync writes. */
  const pendingLocalSkills = () => {
    const names = ["review", "triage"];
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        skills: Object.fromEntries(names.map((name) => [name, `./vendor/${name}`])),
      },
    });
    cleanups.push(workspace.cleanup);
    for (const name of names) writeLocalSkillPackage(workspace.root, { name });
    return workspace;
  };

  const validatedReads = ["readLink", "stat", "readFile"] as const;
  const countsOf = (counts: Readonly<Partial<Record<string, number>>>) =>
    Object.fromEntries(validatedReads.map((method) => [method, counts[method] ?? 0]));

  it.effect("validation reads each preflight document once under the lock", () => {
    const workspace = pendingLocalSkills();
    const at = (relative: string) => nodePath.join(workspace.root, relative);
    return workspace
      .provide(
        Effect.gen(function* () {
          const recording = yield* FileSystemRecorder;
          const candidate = yield* SyncWorkspace.prepare(syncRequest());
          if (candidate._tag === "AlreadyReconciled") throw new Error("Expected a sync plan");
          const userSettings = candidate.preflightMaterial.materialPaths.find(
            (path) => !path.startsWith(workspace.root),
          );
          expect(new Set(candidate.preflightMaterial.materialPaths)).toEqual(
            new Set([at("axm.json"), at("axm.lock"), userSettings]),
          );
          const facts: WorkFact[] = [];
          recording.reset();
          const result = yield* SyncWorkspace.previewOrApply(
            candidate,
            preapprovedPlanExecution,
          ).pipe(
            Effect.provideService(CurrentWorkObserver, {
              record: (fact) => {
                facts.push(fact);
              },
              detailSelected: () => false,
            }),
          );
          expect(deriveOperationOutcome(result)).toBe("applied");
          // Materials only the candidate fingerprints are still read live.
          expect(recording.counts(at("vendor/review"))).toEqual({
            readLink: 4,
            stat: 5,
            realPath: 3,
            readDirectory: 2,
          });
          expect(recording.counts(at("vendor/review/skill.json"))).toEqual({
            readLink: 4,
            stat: 4,
            realPath: 2,
            open: 1,
            "file.readAlloc": 2,
            readFile: 1,
          });
          expect(recording.counts(at(".claude/skills/review"))).toEqual({
            readLink: 29,
            stat: 21,
            realPath: 6,
            symlink: 1,
          });
          // The candidate check and the preflight check share these documents'
          // reads inside one fresh validation observation.
          expect(countsOf(recording.counts(at("axm.json")))).toEqual({
            readLink: 15,
            stat: 13,
            readFile: 25,
          });
          expect(countsOf(recording.counts(at("axm.lock")))).toEqual({
            readLink: 37,
            stat: 41,
            readFile: 39,
          });
          expect(countsOf(recording.counts(userSettings ?? ""))).toEqual({
            readLink: 1,
            stat: 1,
            readFile: 0,
          });
          // Both digests are still computed: the candidate's and the preflight's.
          expect(facts.filter((fact) => fact.kind === "axm.hash.execution-materials")).toHaveLength(
            2,
          );
        }),
      )
      .pipe(
        Effect.provide(
          layerRecordingFileSystem(NodeFileSystem.layer).pipe(
            Layer.provideMerge(NodeServices.layer),
          ),
        ),
      );
  });

  it.effect("refuses a prepared sync after a foreign settings edit", () => {
    const workspace = pendingLocalSkills();
    return workspace
      .provide(
        Effect.gen(function* () {
          const candidate = yield* SyncWorkspace.prepare(syncRequest());
          if (candidate._tag === "AlreadyReconciled") throw new Error("Expected a sync plan");
          workspace.writeSettings({
            owner: "@acme",
            agents: ["claude-code"],
            skills: { review: "./vendor/review" },
          });
          const before = workspace.snapshot();
          const result = yield* SyncWorkspace.previewOrApply(candidate, preapprovedPlanExecution);
          expect(deriveOperationOutcome(result)).toBe("blocked");
          expect(result.blocking?.class).toBe("stale-candidate");
          expect(workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("validates the settings bytes it read when they are reformatted mid-validation", () => {
    // Under the lock, the candidate check and the preflight check observe the
    // settings once. A same-meaning foreign rewrite landing right after that
    // read is not seen by the preflight check; AXM writes no settings, so the
    // rewritten bytes stay on disk.
    const workspace = pendingLocalSkills();
    const settingsPath = nodePath.join(workspace.root, "axm.json");
    const holderPath = nodePath.join(
      workspace.root,
      ".axm/tmp/workspace-transition.lock/holder.json",
    );
    const race: { armed: boolean; locked: boolean; edited?: string } = {
      armed: false,
      locked: false,
    };
    const rewriteAfterFirstLockedRead = Layer.effectContext(
      Effect.gen(function* () {
        const base = yield* FileSystem.FileSystem;
        const recording = yield* FileSystemRecorder;
        const fileSystem = FileSystem.make({
          ...base,
          writeFile: (path, data, options) =>
            base.writeFile(path, data, options).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  if (race.armed && path === holderPath) race.locked = true;
                }),
              ),
            ),
          readFile: (path) =>
            base.readFile(path).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  if (!race.locked || path !== settingsPath || race.edited !== undefined) return;
                  const parsed: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
                  race.edited = `${JSON.stringify(parsed)}\n`;
                  fs.writeFileSync(settingsPath, race.edited);
                }),
              ),
            ),
        });
        return Context.make(FileSystem.FileSystem, fileSystem).pipe(
          Context.add(FileSystemRecorder, recording),
        );
      }),
    ).pipe(Layer.provide(layerRecordingFileSystem(NodeFileSystem.layer)));
    return workspace
      .provide(
        Effect.gen(function* () {
          const recording = yield* FileSystemRecorder;
          const candidate = yield* SyncWorkspace.prepare(syncRequest());
          if (candidate._tag === "AlreadyReconciled") throw new Error("Expected a sync plan");
          recording.reset();
          race.armed = true;
          const result = yield* SyncWorkspace.previewOrApply(candidate, preapprovedPlanExecution);
          expect(race.edited).toBeDefined();
          expect(deriveOperationOutcome(result)).toBe("applied");
          expect(recording.writes(settingsPath)).toBe(0);
          expect(fs.readFileSync(settingsPath, "utf8")).toBe(race.edited);
        }),
      )
      .pipe(
        Effect.provide(rewriteAfterFirstLockedRead.pipe(Layer.provideMerge(NodeServices.layer))),
      );
  });
});
