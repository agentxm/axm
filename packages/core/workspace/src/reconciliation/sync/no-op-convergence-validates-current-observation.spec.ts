import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { WorkspaceRecords } from "../../desired-state/index.js";
import { WorkspaceInvariantFacts } from "../../projection/index.js";
import { writeLocalRulePackage } from "../../lifecycle/testing.js";
import { SyncWorkspace } from "./sync-workspace.js";
import { applySync, makeSyncFixture, syncRequest, writeLocalSkillPackage } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/sync/no-op-convergence-validates-current-observation",
  title: "Sync does not report convergence from stale workspace observations",
  statement:
    "When a managed projection disappears, workspace settings change, or an owned aggregate changes during observation, sync shall not report a no-op based on the earlier observed state.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/sync/realizes-desired-state"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Sync no-op observation freshness", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("refuses a no-op when an agent skill disappears during observation", () => {
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        skills: { review: "./vendor/review" },
      },
    });
    cleanups.push(workspace.cleanup);
    writeLocalSkillPackage(workspace.root, { name: "review" });

    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();
          const projection = ".claude/skills/review";
          expect(workspace.exists(projection)).toBe(true);
          const records = yield* WorkspaceRecords;
          let changed = false;
          const observed = {
            ...records,
            getExtensionInventory: (type, options) =>
              records.getExtensionInventory(type, options).pipe(
                Effect.tap(() =>
                  Effect.sync(() => {
                    if (type !== "skill" || changed) return;
                    workspace.remove(projection);
                    changed = true;
                  }),
                ),
              ),
          } satisfies typeof records;
          const result = yield* SyncWorkspace.prepare(syncRequest()).pipe(
            Effect.provideService(WorkspaceRecords, observed),
            Effect.result,
          );
          expect(changed).toBe(true);
          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result)) {
            expect(result.failure).toMatchObject({
              _tag: "WorkspaceSyncFailed",
              category: "conflict",
            });
          }
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "refuses a no-op when settings change during observation without changing inventory",
    () => {
      const workspace = makeSyncFixture({
        settings: {
          owner: "@acme",
          agents: ["claude-code"],
          skills: { review: "./vendor/review" },
        },
      });
      cleanups.push(workspace.cleanup);
      writeLocalSkillPackage(workspace.root, { name: "review" });

      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();
            const records = yield* WorkspaceRecords;
            let changed = false;
            const observed = {
              ...records,
              getExtensionInventory: (type, options) =>
                records.getExtensionInventory(type, options).pipe(
                  Effect.tap(() =>
                    Effect.sync(() => {
                      if (type !== "skill" || changed) return;
                      workspace.writeFile("axm.json", `${workspace.readFile("axm.json")}\n`);
                      changed = true;
                    }),
                  ),
                ),
            } satisfies typeof records;
            const result = yield* SyncWorkspace.prepare(syncRequest()).pipe(
              Effect.provideService(WorkspaceRecords, observed),
              Effect.result,
            );
            expect(changed).toBe(true);
            expect(Result.isFailure(result)).toBe(true);
            if (Result.isFailure(result)) {
              expect(result.failure).toMatchObject({
                _tag: "WorkspaceSyncFailed",
                category: "conflict",
              });
            }
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("refuses a no-op when an owned aggregate changes after its observation", () => {
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        rules: { review: "./vendor/review" },
      },
    });
    cleanups.push(workspace.cleanup);
    writeLocalRulePackage(workspace.root, { name: "review" });

    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();
          const facts = yield* WorkspaceInvariantFacts;
          let changed = false;
          const observed = {
            ...facts,
            projectionFactsForGraph: (graph) =>
              facts.projectionFactsForGraph(graph).pipe(
                Effect.tap(() =>
                  Effect.sync(() => {
                    if (changed) return;
                    workspace.remove("AGENTS.md");
                    changed = true;
                  }),
                ),
              ),
          } satisfies typeof facts;
          const result = yield* SyncWorkspace.prepare(syncRequest()).pipe(
            Effect.provideService(WorkspaceInvariantFacts, observed),
            Effect.result,
          );
          expect(changed).toBe(true);
          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result)) {
            expect(result.failure).toMatchObject({
              _tag: "WorkspaceSyncFailed",
              category: "conflict",
            });
          }
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
