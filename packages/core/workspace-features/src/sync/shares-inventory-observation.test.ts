import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import {
  DesiredStateReader,
  WorkspaceReadViews,
  WorkspaceRecords,
} from "@agentxm/workspace-kernel/workspace-state";
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

/** Count the real readers selected for each planning or fresh validation phase. */
const countPhaseReads = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  counts: { skillInventoryReads: number; graphReads: number },
) =>
  Effect.gen(function* () {
    const views = yield* WorkspaceReadViews;
    return yield* effect.pipe(
      Effect.provideService(WorkspaceReadViews, {
        capture: (options) =>
          views.capture(options).pipe(
            Effect.map((context) => {
              const records = Context.get(context, WorkspaceRecords);
              const desired = Context.get(context, DesiredStateReader);
              return context.pipe(
                Context.add(WorkspaceRecords, {
                  ...records,
                  getExtensionInventory: (type, selection) =>
                    Effect.sync(() => {
                      if (type === "skill") counts.skillInventoryReads += 1;
                    }).pipe(Effect.andThen(records.getExtensionInventory(type, selection))),
                }),
                Context.add(DesiredStateReader, {
                  ...desired,
                  evaluate: (selection) =>
                    Effect.sync(() => {
                      counts.graphReads += 1;
                    }).pipe(Effect.andThen(desired.evaluate(selection))),
                  graph: (selection) =>
                    Effect.sync(() => {
                      counts.graphReads += 1;
                    }).pipe(Effect.andThen(desired.graph(selection))),
                }),
              );
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
          const counts = { skillInventoryReads: 0, graphReads: 0 };
          yield* countPhaseReads(SyncWorkspace.prepare(syncRequest()), counts);
          expect(counts.skillInventoryReads).toBe(2);
          expect(counts.graphReads).toBe(2);
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
          const counts = { skillInventoryReads: 0, graphReads: 0 };
          const candidate = yield* countPhaseReads(SyncWorkspace.prepare(syncRequest()), counts);
          expect(candidate._tag).toBe("SyncWorkspace");
          expect(counts.graphReads).toBe(2);
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
