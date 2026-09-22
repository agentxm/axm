import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { DesiredStateReader, WorkspaceRecords } from "../../desired-state/index.js";
import { deriveOperationOutcome, previewPlanExecution } from "../../transitions/planning/index.js";
import { preapprovedPlanExecution } from "../../transitions/planning/testing.js";
import { SyncWorkspace } from "./sync-workspace.js";
import { applySync, makeSyncFixture, syncRequest, writeLocalSkillPackage } from "./test-helpers.js";

describe("Sync inventory observation", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("shares planning reads and performs one uncached validation read", () => {
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
          const records = yield* WorkspaceRecords;
          const desiredState = yield* DesiredStateReader;
          let skillInventoryReads = 0;
          let graphReads = 0;
          const observed = {
            ...records,
            getExtensionInventory: (type, options) =>
              Effect.sync(() => {
                if (type === "skill") skillInventoryReads += 1;
              }).pipe(Effect.andThen(records.getExtensionInventory(type, options))),
          } satisfies typeof records;
          const observedGraph = {
            ...desiredState,
            graph: (options) =>
              Effect.sync(() => {
                graphReads += 1;
              }).pipe(Effect.andThen(desiredState.graph(options))),
          } satisfies typeof desiredState;
          yield* SyncWorkspace.prepare(syncRequest()).pipe(
            Effect.provideService(WorkspaceRecords, observed),
            Effect.provideService(DesiredStateReader, observedGraph),
          );
          expect(skillInventoryReads).toBe(2);
          expect(graphReads).toBe(2);
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
