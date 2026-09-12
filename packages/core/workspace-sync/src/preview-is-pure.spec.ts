import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { preapprovedPlanExecution } from "@agentxm/workspace-operations/testing";
import { SyncWorkspace } from "./sync-workspace.js";
import { syncRequest } from "./testing.js";
import {
  countUnitStates,
  deriveOperationOutcome,
  previewPlanExecution,
} from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  applySync,
  expectResolved,
  makeSyncFixture,
  previewSync,
  writeLocalSkillPackage,
  type SyncFixture,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/sync/preview-is-pure",
  title: "Sync preview describes required changes without applying them",
  statement:
    "When sync runs in preview mode against a workspace whose managed state has drifted from desired state, it shall report the reconciliation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/sync/realizes-desired-state"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

// Route flag grammar (`--preview` accepted, `--yes` unrecognized) is owned by
// cli/preview-uses-the-canonical-flag and
// cli/confirmation-flags-have-a-supported-purpose, which sweep every route
// from the command-route allocation. A convergence check (`--fail-on-change`)
// is this same preview with the divergence flag the adapter adds afterwards,
// so that it too writes nothing is witnessed across process boundaries by
// cli/sync/check-reports-convergence.

const SKILL = "code-review";
const PROJECTION = `.claude/skills/${SKILL}`;

describe("Sync preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const fixture = (settings: Readonly<Record<string, unknown>> = {}): SyncFixture => {
    const workspace = makeSyncFixture({
      settings: { owner: "@acme", agents: ["claude-code"], ...settings },
    });
    cleanups.push(workspace.cleanup);
    return workspace;
  };

  /** An installed skill whose agent projection was deleted, so sync has work to do. */
  const driftedWorkspace = (workspace: SyncFixture) =>
    Effect.gen(function* () {
      writeLocalSkillPackage(workspace.root, { name: SKILL });
      workspace.writeSettings({
        owner: "@acme",
        agents: ["claude-code"],
        skills: { [SKILL]: `./vendor/${SKILL}` },
      });
      yield* applySync();
      expect(workspace.exists(PROJECTION)).toBe(true);
      workspace.remove(PROJECTION);
      expect(workspace.exists(PROJECTION)).toBe(false);
    });

  it.effect("rejects a prepared reconciliation after its desired authority changes", () => {
    const workspace = fixture();
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* driftedWorkspace(workspace);
          const candidate = yield* SyncWorkspace.prepare(syncRequest());
          if (candidate._tag === "AlreadyReconciled")
            throw new Error("Expected reconciliation work");
          yield* SyncWorkspace.previewOrApply(candidate, previewPlanExecution);
          workspace.writeFile("axm.json", `${workspace.readFile("axm.json")}\n`);
          const before = workspace.snapshot();
          const resolution = yield* SyncWorkspace.previewOrApply(
            candidate,
            preapprovedPlanExecution,
          );
          expect(deriveOperationOutcome(resolution)).toBe("blocked");
          expect(workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("rejects changed local source bytes before first accepted acquisition", () => {
    const workspace = fixture({ skills: { [SKILL]: `./vendor/${SKILL}` } });
    writeLocalSkillPackage(workspace.root, { name: SKILL });
    return workspace
      .provide(
        Effect.gen(function* () {
          const candidate = yield* SyncWorkspace.prepare(syncRequest());
          if (candidate._tag === "AlreadyReconciled") throw new Error("Expected first acquisition");
          yield* SyncWorkspace.previewOrApply(candidate, previewPlanExecution);
          const source = `vendor/${SKILL}/src/SKILL.md`;
          workspace.writeFile(
            source,
            `${workspace.readFile(source)}\nChanged after preparation.\n`,
          );
          const before = workspace.snapshot();
          const result = yield* SyncWorkspace.previewOrApply(candidate, preapprovedPlanExecution);
          expect(deriveOperationOutcome(result)).toBe("blocked");
          expect(workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("a previewed reconciliation changes no protected state", () => {
    const workspace = fixture();
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* driftedWorkspace(workspace);
          const before = workspace.snapshot();
          const homeBefore = workspace.homeSnapshot();

          const resolution = expectResolved(yield* previewSync());

          expect(resolution.mode).toBe("preview");
          expect(deriveOperationOutcome(resolution)).toBe("previewed");
          expect(countUnitStates(resolution.units).committed).toBe(0);
          expect(workspace.snapshot()).toEqual(before);
          expect(workspace.homeSnapshot()).toEqual(homeBefore);
          expect(workspace.exists(PROJECTION)).toBe(false);
          expect(workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "the previewed reconciliation is real: applying it afterwards restores what the preview left missing",
    () => {
      const workspace = fixture();
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* driftedWorkspace(workspace);
            const before = workspace.snapshot();

            expectResolved(yield* previewSync());
            expect(workspace.snapshot()).toEqual(before);

            const applied = expectResolved(yield* applySync());

            expect(deriveOperationOutcome(applied)).toBe("applied");
            expect(workspace.exists(PROJECTION)).toBe(true);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect(
    "a previewed reconciliation of a desired extension whose source is missing reports it and changes nothing",
    () => {
      const workspace = fixture({ skills: { ghost: "./vendor/ghost" } });
      const before = workspace.snapshot();
      return workspace
        .provide(
          Effect.gen(function* () {
            const failure = yield* previewSync().pipe(Effect.flip);

            expect(JSON.stringify(failure)).toContain("ghost");
            expect(workspace.snapshot()).toEqual(before);
            expect(workspace.exists(".claude/skills/ghost")).toBe(false);
            expect(workspace.readFile("axm-lock.yaml")).not.toContain("ghost");
            expect(workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
