import { CurrentWorkObserver, type WorkFact } from "@agentxm/host-primitives/work-observation";
import * as Effect from "effect/Effect";
import * as Tracer from "effect/Tracer";
import * as Context from "effect/Context";
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
});
