import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { defineSpecification } from "@agentxm/specification-metadata";

import { makeSpecContext, makeSpecWorkspace } from "./__tests__/plan-spec-support.js";
import { deriveOperationOutcome } from "./operation-resolution.js";
import type { Plan } from "./plan.js";
import { promptablePlanExecution } from "./plan-execution-fixtures.js";
import { prepareExecutionCandidate, resolveExecutionCandidate } from "./resolve-plan.js";

export const specification = defineSpecification({
  requirement: "cli/confirmation-is-required-only-for-actionable-risk",
  title: "A person is asked to confirm only when the plan carries a risk worth confirming",
  statement:
    "An apply whose plan carries no confirmable risk shall proceed without asking, an apply with nothing to do shall finish without asking, and an apply whose plan carries a confirmable risk shall ask when a prompt can open, honor a declined answer by changing nothing, and stop as approval required when no prompt can open.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "memory",
  boundaryRationale:
    "Whether a confirmation opens is decided by the execution resolution over a prepared candidate's risk conditions; no process or filesystem fact is involved.",
  methods: ["example"],
  derivedFrom: ["cli/machine-mode-never-prompts", "cli/preview-does-not-consume-approval"],
  supersedes: [],
  assumptions: [
    "That a real plan carries the confirmable `replace-workspace-authority` risk is witnessed by cli/demote/preview-is-pure at the owning feature; this specification owns only what the resolution does with such a risk.",
  ],
  openQuestions: [],
});

const step = (label: string, onRun: () => void) =>
  ({
    readiness: "ready" as const,
    key: `skill:${label}`,
    label,
    run: Effect.sync(() => {
      onRun();
      return { result: "success" as const, message: "applied" };
    }),
  }) satisfies Plan["jobs"][number]["steps"][number];

const makePlan = (args: {
  readonly name: string;
  readonly confirmable?: boolean;
  readonly onRun?: () => void;
  readonly empty?: boolean;
}): Plan => ({
  _tag: "Plan",
  name: args.name,
  description: Option.none(),
  ...(args.confirmable === true
    ? {
        riskConditions: [
          {
            level: "confirmable" as const,
            id: "replace-workspace-authority",
            detail: "The workspace-authored package is replaced by the selected source",
          },
        ],
      }
    : {}),
  jobs: [
    {
      concurrency: 1,
      steps: args.empty === true ? [] : [step("review", args.onRun ?? (() => undefined))],
    },
  ],
});

const recovery = { command: ["demote"], arguments: [] };

describe("Confirmation and actionable risk", () => {
  it.effect("an apply with no confirmable risk proceeds without asking", () =>
    Effect.gen(function* () {
      const workspace = yield* makeSpecWorkspace("axm-confirm-none-");
      const services = makeSpecContext(workspace.workspaceDir, { confirmationAvailable: true });
      let applied = 0;

      const resolution = yield* prepareExecutionCandidate(
        makePlan({ name: "Install @acme/skills/review", onRun: () => (applied += 1) }),
      ).pipe(
        Effect.flatMap((candidate) =>
          resolveExecutionCandidate(candidate, promptablePlanExecution(recovery)),
        ),
        Effect.provide(services.layer),
      );

      expect(deriveOperationOutcome(resolution)).toBe("applied");
      expect(applied).toBe(1);
      expect(services.interaction.state.confirmApplyChangesCalls).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("an apply with nothing to do finishes without asking", () =>
    Effect.gen(function* () {
      const workspace = yield* makeSpecWorkspace("axm-confirm-noop-");
      const services = makeSpecContext(workspace.workspaceDir, { confirmationAvailable: true });

      const resolution = yield* prepareExecutionCandidate(
        makePlan({ name: "Install @acme/skills/review", confirmable: true, empty: true }),
      ).pipe(
        Effect.flatMap((candidate) =>
          resolveExecutionCandidate(candidate, promptablePlanExecution(recovery)),
        ),
        Effect.provide(services.layer),
      );

      expect(deriveOperationOutcome(resolution)).toBe("no-op");
      expect(services.interaction.state.confirmApplyChangesCalls).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("a declined confirmation cancels and changes nothing", () =>
    Effect.gen(function* () {
      const workspace = yield* makeSpecWorkspace("axm-confirm-declined-");
      const services = makeSpecContext(workspace.workspaceDir, {
        confirmationAvailable: true,
        confirmApplyChanges: () => Effect.succeed("declined" as const),
      });
      let applied = 0;

      const resolution = yield* prepareExecutionCandidate(
        makePlan({
          name: "Demote @acme/skills/review",
          confirmable: true,
          onRun: () => (applied += 1),
        }),
      ).pipe(
        Effect.flatMap((candidate) =>
          resolveExecutionCandidate(candidate, promptablePlanExecution(recovery)),
        ),
        Effect.provide(services.layer),
      );

      expect(deriveOperationOutcome(resolution)).toBe("cancelled");
      expect(applied).toBe(0);
      expect(services.interaction.state.confirmApplyChangesCalls).toHaveLength(1);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("an accepted confirmation applies the plan it asked about", () =>
    Effect.gen(function* () {
      const workspace = yield* makeSpecWorkspace("axm-confirm-approved-");
      const services = makeSpecContext(workspace.workspaceDir, {
        confirmationAvailable: true,
        confirmApplyChanges: () => Effect.succeed("approved" as const),
      });
      let applied = 0;

      const resolution = yield* prepareExecutionCandidate(
        makePlan({
          name: "Demote @acme/skills/review",
          confirmable: true,
          onRun: () => (applied += 1),
        }),
      ).pipe(
        Effect.flatMap((candidate) =>
          resolveExecutionCandidate(candidate, promptablePlanExecution(recovery)),
        ),
        Effect.provide(services.layer),
      );

      expect(deriveOperationOutcome(resolution)).toBe("applied");
      expect(applied).toBe(1);
      expect(resolution.declined).not.toBe(true);
      expect(services.interaction.state.confirmApplyChangesCalls).toHaveLength(1);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("an apply that cannot open a prompt stops as approval required", () =>
    Effect.gen(function* () {
      const workspace = yield* makeSpecWorkspace("axm-confirm-unattended-");
      const services = makeSpecContext(workspace.workspaceDir, { confirmationAvailable: false });
      let applied = 0;

      const resolution = yield* prepareExecutionCandidate(
        makePlan({
          name: "Demote @acme/skills/review",
          confirmable: true,
          onRun: () => (applied += 1),
        }),
      ).pipe(
        Effect.flatMap((candidate) =>
          resolveExecutionCandidate(candidate, promptablePlanExecution(recovery)),
        ),
        Effect.provide(services.layer),
      );

      expect(deriveOperationOutcome(resolution)).toBe("blocked");
      expect(resolution.blocking?.class).toBe("approval-required");
      expect(applied).toBe(0);
      expect(services.interaction.state.confirmApplyChangesCalls).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
