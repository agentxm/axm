import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleDemote, handleSetup } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../support/install-harness.js";
import {
  WORKSPACE_PROTECTED_STATE,
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../support/preview-purity.js";
import { writeAuthoredSkill } from "../support/publish-harness.js";
import { makeSetupSpecContext } from "../support/setup-harness.js";

export const specification = defineSpecification({
  requirement: "cli/preview-does-not-consume-approval",
  title: "A preview reads the same with or without advance approval and spends none of it",
  statement:
    "When a command that offers both assessment and advance approval runs in preview mode, it shall render the same candidate whether or not approval accompanies the request, shall ask for no confirmation, and a later unattended apply without approval shall still stop as approval required with nothing changed.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/demote/preview-is-pure", "cli/setup/preview-is-pure"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const SKILL = "review";
const FQN = `@acme/skills/${SKILL}`;
const SETUP_PROTECTED_STATE = [...WORKSPACE_PROTECTED_STATE, ".axm"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** The candidate a plan preview renders, independent of when it rendered. */
const assessedCandidate = (data: unknown): unknown => {
  if (!isRecord(data) || !isRecord(data["result"])) return undefined;
  const result = data["result"];
  return {
    planName: result["planName"],
    outcome: result["outcome"],
    counts: result["counts"],
    units: result["units"],
    riskConditions: result["riskConditions"],
  };
};

describe("Preview and advance approval", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  describe("demote", () => {
    const authoredWorkspace = () => {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        recordWrites: true,
        settings: { owner: "@acme", skills: { [SKILL]: "workspace" } },
      });
      cleanups.push(workspace.cleanup);
      writeAuthoredSkill(workspace.root, { name: SKILL });
      const replacement = writeLocalSkillPackage(workspace.root, {
        name: SKILL,
        body: "Replacement guidance.",
      });
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);
      return { workspace, replacement, before };
    };

    it.effect(
      "a preview renders one candidate with or without approval and leaves the approval unspent",
      () =>
        Effect.gen(function* () {
          const { workspace, replacement, before } = authoredWorkspace();
          const demote = (yes: boolean, preview: boolean) =>
            handleDemote({ fqn: FQN, source: replacement, yes, preview }).pipe(
              Effect.provide(workspace.layer),
            );

          yield* demote(false, true);
          yield* demote(true, true);
          const [withoutApproval, withApproval] = workspace.rendererState.results;
          expect(assessedCandidate(withoutApproval?.data)).toMatchObject({
            planName: "Demote workspace extension",
            outcome: "previewed",
            riskConditions: [expect.objectContaining({ id: "replace-workspace-authority" })],
          });
          expect(assessedCandidate(withApproval?.data)).toEqual(
            assessedCandidate(withoutApproval?.data),
          );
          expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
          expectProtectedStateUntouched({ root: workspace.root, before, writes: workspace.writes });

          workspace.rendererState.results.splice(0);
          yield* demote(false, false);

          expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
          const [applied] = workspace.rendererState.results;
          expect(applied?.ok).toBe(false);
          expect(applied?.data).toMatchObject({
            result: {
              outcome: "blocked",
              counts: { committed: 0 },
              blocking: { class: "approval-required", subject: "replace-workspace-authority" },
            },
          });
          expectProtectedStateUntouched({ root: workspace.root, before, writes: workspace.writes });
          expect(workspace.readSettings()).toMatchObject({ skills: { [SKILL]: "workspace" } });
        }),
    );
  });

  describe("setup", () => {
    const expectNoPrompt = (context: ReturnType<typeof makeSetupSpecContext>): void => {
      expect(context.promptState.selectAgentsCalls).toEqual([]);
      expect(context.promptState.confirmInstructionSyncCalls).toEqual([]);
      expect(context.promptState.selectInstructionSourceCalls).toEqual([]);
      expect(context.promptState.confirmSetupPlanCalls).toEqual([]);
    };

    it.effect(
      "a preview renders one candidate with or without approval and leaves the approval unspent",
      () =>
        Effect.gen(function* () {
          const context = makeSetupSpecContext({
            machine: true,
            flags: { nonInteractive: true, json: true },
            recordWrites: true,
          });
          cleanups.push(context.cleanup);
          const before = snapshotProtectedState(context.root, SETUP_PROTECTED_STATE);
          const setup = (args: { readonly yes?: boolean; readonly preview?: boolean }) =>
            handleSetup({
              scope: "project",
              scopeExplicit: true,
              agents: ["claude-code"],
              ...args,
            }).pipe(Effect.provide(context.layer));

          yield* setup({ preview: true });
          yield* setup({ preview: true, yes: true });
          const [withoutApproval, withApproval] = context.rendererState.results;
          expect(withoutApproval?.data).toMatchObject({
            result: { outcome: "previewed", status: "preview", changed: false },
          });
          expect(withApproval?.data).toEqual(withoutApproval?.data);
          expectNoPrompt(context);
          expectProtectedStateUntouched({
            root: context.root,
            before,
            writes: context.writes,
            protectedPaths: SETUP_PROTECTED_STATE,
          });

          context.rendererState.results.splice(0);
          const exit = yield* setup({}).pipe(Effect.exit);

          expect(Exit.isFailure(exit)).toBe(true);
          const applied = context.rendererState.results.at(-1);
          expect(applied?.ok).toBe(false);
          expect(applied?.data).toMatchObject({
            result: { outcome: "failed", status: "approval-required", changed: false },
          });
          expectNoPrompt(context);
          expectProtectedStateUntouched({
            root: context.root,
            before,
            writes: context.writes,
            protectedPaths: SETUP_PROTECTED_STATE,
          });
          expect(context.exists("axm.json")).toBe(false);
        }),
    );
  });
});
