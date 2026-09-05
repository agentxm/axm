import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleAgentsAdd, handleInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  WORKSPACE_PROTECTED_STATE,
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/agents/add/preview-is-pure",
  title: "Agent add preview describes the new membership without changing any state",
  statement:
    "When agents add runs in preview mode for a coding agent the workspace does not yet configure, it shall report the membership and realized outputs it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or any agent's outputs.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/agents/add/records-membership-and-realizes-outputs"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/** The workspace state plus the outputs of the agent the preview would add. */
const PROTECTED_STATE = [...WORKSPACE_PROTECTED_STATE, ".opencode"];

describe("Agent add preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** A workspace with one installed skill, so adding an agent would realize outputs. */
  const workspaceWithSkill = Effect.gen(function* () {
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
    return workspace;
  });

  it.effect("a previewed add of an unconfigured agent changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = yield* workspaceWithSkill;
      const before = snapshotProtectedState(workspace.root, PROTECTED_STATE);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);

      yield* handleAgentsAdd({
        ids: ["opencode"],
        detected: false,
        force: false,
        preview: true,
      }).pipe(Effect.provide(workspace.layer));

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
        protectedPaths: PROTECTED_STATE,
      });
      expect(workspace.readSettings()).toMatchObject({ agents: ["claude-code"] });
      expect(workspace.exists(".opencode")).toBe(false);
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          units: expect.arrayContaining([
            expect.objectContaining({ label: "Add opencode", state: "ready" }),
          ]),
        },
      });
    }),
  );

  it.effect(
    "a previewed add of a retired agent without its named policy reports the required override and changes nothing",
    () =>
      Effect.gen(function* () {
        const workspace = yield* workspaceWithSkill;
        const before = snapshotProtectedState(workspace.root, PROTECTED_STATE);
        workspace.writes.splice(0);
        workspace.rendererState.results.splice(0);

        yield* handleAgentsAdd({
          ids: ["gemini-cli"],
          detected: false,
          force: false,
          preview: true,
        }).pipe(Effect.provide(workspace.layer));

        expectProtectedStateUntouched({
          root: workspace.root,
          before,
          writes: workspace.writes,
          protectedPaths: PROTECTED_STATE,
        });
        expect(workspace.readSettings()).toMatchObject({ agents: ["claude-code"] });
        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
        const [entry] = workspace.rendererState.results;
        expect(entry?.data).toMatchObject({
          result: {
            outcome: "previewed",
            riskConditions: [
              expect.objectContaining({
                level: "override-required",
                policy: "accept-warnings",
                requiredFlag: "--accept-warnings",
              }),
            ],
          },
        });
      }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["agents", "add"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["agents", "add"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["agents", "add"], "-y")).toBe("unrecognized");
    }),
  );
});
