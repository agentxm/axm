import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  expectNoOpPlanResult,
  handleAgentsAdd,
  handleAgentsRemove,
  handleInstall,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  WORKSPACE_PROTECTED_STATE,
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/agents/remove/preview-is-pure",
  title: "Agent remove preview describes the departing membership without changing any state",
  statement:
    "When agents remove runs in preview mode for a configured coding agent, it shall report the membership and owned outputs it would remove with a previewed outcome and shall not change settings, the lockfile, canonical content, or any agent's outputs.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/agents/remove/removes-membership-and-owned-outputs"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/** The workspace state plus the outputs of the agent the preview would remove. */
const PROTECTED_STATE = [...WORKSPACE_PROTECTED_STATE, ".opencode"];

describe("Agent remove preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** A workspace with one installed skill realized for a second configured agent. */
  const workspaceWithSecondAgent = Effect.gen(function* () {
    const workspace = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      recordWrites: true,
    });
    cleanups.push(workspace.cleanup);
    const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
    yield* handleInstall({ source: Option.some(skillPackage), force: false, preview: false }).pipe(
      Effect.provide(workspace.layer),
    );
    yield* handleAgentsAdd({
      ids: ["opencode"],
      detected: false,
      force: false,
      preview: false,
    }).pipe(Effect.provide(workspace.layer));
    expect(workspace.readSettings()).toMatchObject({ agents: ["claude-code", "opencode"] });
    expect(workspace.exists(".opencode/skills/code-review")).toBe(true);
    return workspace;
  });

  it.effect("a previewed remove of a configured agent changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = yield* workspaceWithSecondAgent;
      const before = snapshotProtectedState(workspace.root, PROTECTED_STATE);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);

      yield* handleAgentsRemove({ ids: ["opencode"], force: false, preview: true }).pipe(
        Effect.provide(workspace.layer),
      );

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
        protectedPaths: PROTECTED_STATE,
      });
      expect(workspace.readSettings()).toMatchObject({ agents: ["claude-code", "opencode"] });
      expect(workspace.exists(".opencode/skills/code-review")).toBe(true);
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          units: expect.arrayContaining([
            expect.objectContaining({ label: "Remove opencode", state: "ready" }),
          ]),
        },
      });
    }),
  );

  it.effect(
    "a previewed remove of an agent that is not configured reports a no-op and changes nothing",
    () =>
      Effect.gen(function* () {
        const workspace = yield* workspaceWithSecondAgent;
        const before = snapshotProtectedState(workspace.root, PROTECTED_STATE);
        workspace.writes.splice(0);
        workspace.rendererState.results.splice(0);

        yield* handleAgentsRemove({ ids: ["cursor"], force: false, preview: true }).pipe(
          Effect.provide(workspace.layer),
        );

        expectProtectedStateUntouched({
          root: workspace.root,
          before,
          writes: workspace.writes,
          protectedPaths: PROTECTED_STATE,
        });
        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
        expectNoOpPlanResult(workspace.rendererState.results[0]?.data, {
          planName: "Remove coding agents",
          message: "All requested agents are already absent",
        });
      }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["agents", "remove"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["agents", "remove"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["agents", "remove"], "-y")).toBe("unrecognized");
    }),
  );
});
