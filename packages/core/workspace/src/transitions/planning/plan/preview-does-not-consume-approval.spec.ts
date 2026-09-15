import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { defineSpecification } from "@agentxm/specification-metadata";

import { makeSpecContext, makeSpecWorkspace } from "./__tests__/plan-spec-support.js";
import { countUnitStates, deriveOperationOutcome } from "./operation-resolution.js";
import type { Plan } from "./plan.js";
import { promptablePlanExecution } from "./plan-execution-fixtures.js";
import { requestedPlanExecution } from "./plan-execution.js";
import { prepareExecutionCandidate, resolveExecutionCandidate } from "./resolve-plan.js";

export const specification = defineSpecification({
  requirement: "cli/preview-does-not-consume-approval",
  title: "A preview reads the same with or without advance approval and spends none of it",
  statement:
    "When a command that offers both assessment and advance approval runs in preview mode, it shall render the same candidate whether or not approval accompanies the request, shall ask for no confirmation, and a later unattended apply without approval shall still stop as approval required with nothing changed.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  boundary: "memory",
  boundaryRationale:
    "Whether an approval is spent is decided by the execution resolution over one prepared candidate; no process or filesystem fact is involved.",
  methods: ["example"],
  derivedFrom: ["cli/demote/preview-is-pure"],
  supersedes: [],
  assumptions: [
    "That a real workspace plan carries the confirmable `replace-workspace-authority` risk is witnessed by cli/demote/preview-is-pure at the owning feature; this rule owns only what a preview does with such a risk and with the approval a request carries.",
  ],
  openQuestions: [],
});

/** A plan carrying the risk a person is asked to confirm before it applies. */
const replacesWorkspaceAuthority = (onRun: () => void): Plan => ({
  _tag: "Plan",
  name: "Demote @acme/skills/review",
  description: Option.some("Replace the workspace-authored package with @acme/skills/review"),
  riskConditions: [
    {
      level: "confirmable",
      id: "replace-workspace-authority",
      detail: "The workspace-authored package is replaced by the selected source",
    },
  ],
  jobs: [
    {
      concurrency: 1,
      steps: [
        {
          readiness: "ready",
          key: "skill:review",
          label: "review",
          run: Effect.sync(() => {
            onRun();
            return { result: "success", message: "demoted" };
          }),
        },
      ],
    },
  ],
});

const recovery = { command: ["demote"], arguments: [] };

describe("Preview and advance approval", () => {
  it.effect("previews the candidate an apply would use, asking for nothing", () =>
    Effect.gen(function* () {
      const workspace = yield* makeSpecWorkspace("axm-preview-approval-");
      const services = makeSpecContext(workspace.workspaceDir, { confirmationAvailable: true });
      let applied = 0;

      const candidate = yield* prepareExecutionCandidate(
        replacesWorkspaceAuthority(() => (applied += 1)),
      ).pipe(Effect.provide(services.layer));
      const previewed = yield* resolveExecutionCandidate(
        candidate,
        requestedPlanExecution({ intent: { preview: true, yes: false }, recovery }),
      ).pipe(Effect.provide(services.layer));

      expect(deriveOperationOutcome(previewed)).toBe("previewed");
      expect(previewed.candidateId).toBe(candidate.id);
      expect(previewed.riskConditions?.[0]?.id).toBe("replace-workspace-authority");
      expect(applied).toBe(0);
      // A prompt was available and was not opened, so no approval was spent.
      expect(services.interaction.state.confirmApplyChangesCalls).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "renders one candidate whether or not advance approval accompanies the request, spending neither",
    () =>
      Effect.gen(function* () {
        const workspace = yield* makeSpecWorkspace("axm-preview-approval-parity-");
        const services = makeSpecContext(workspace.workspaceDir, { confirmationAvailable: true });
        let applied = 0;

        // One prepared candidate, resolved under two requests that differ only
        // in the advance approval the person supplied.
        const candidate = yield* prepareExecutionCandidate(
          replacesWorkspaceAuthority(() => (applied += 1)),
        ).pipe(Effect.provide(services.layer));
        const previewUnder = (yes: boolean) =>
          resolveExecutionCandidate(
            candidate,
            requestedPlanExecution({ intent: { preview: true, yes }, recovery }),
          ).pipe(Effect.provide(services.layer));

        const withoutApproval = yield* previewUnder(false);
        const withApproval = yield* previewUnder(true);

        expect(deriveOperationOutcome(withoutApproval)).toBe("previewed");
        expect(deriveOperationOutcome(withApproval)).toBe(deriveOperationOutcome(withoutApproval));
        expect(withApproval.name).toBe(withoutApproval.name);
        expect(withApproval.mode).toBe("preview");
        expect(withApproval.candidateId).toBe(withoutApproval.candidateId);
        expect(withApproval.units).toEqual(withoutApproval.units);
        expect(countUnitStates(withApproval.units)).toEqual(countUnitStates(withoutApproval.units));
        expect(withApproval.riskConditions).toEqual(withoutApproval.riskConditions);
        expect(withApproval.riskConditions?.[0]?.id).toBe("replace-workspace-authority");
        // Neither preview ran the step, and neither opened the prompt that was
        // available: the approval the second request carried was not spent.
        expect(applied).toBe(0);
        expect(services.interaction.state.confirmApplyChangesCalls).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("an unattended apply after a preview still stops as approval required", () =>
    Effect.gen(function* () {
      const workspace = yield* makeSpecWorkspace("axm-preview-approval-apply-");
      const services = makeSpecContext(workspace.workspaceDir, { confirmationAvailable: false });
      let applied = 0;

      const candidate = yield* prepareExecutionCandidate(
        replacesWorkspaceAuthority(() => (applied += 1)),
      ).pipe(Effect.provide(services.layer));
      yield* resolveExecutionCandidate(
        candidate,
        requestedPlanExecution({ intent: { preview: true, yes: false }, recovery }),
      ).pipe(Effect.provide(services.layer));
      const resolution = yield* resolveExecutionCandidate(
        candidate,
        promptablePlanExecution(recovery),
      ).pipe(Effect.provide(services.layer));

      expect(deriveOperationOutcome(resolution)).toBe("blocked");
      expect(resolution.blocking?.class).toBe("approval-required");
      expect(resolution.units.every((unit) => unit.state !== "committed")).toBe(true);
      expect(applied).toBe(0);
      // No prompt could open, so nothing was asked and nothing was consumed.
      expect(services.interaction.state.confirmApplyChangesCalls).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
