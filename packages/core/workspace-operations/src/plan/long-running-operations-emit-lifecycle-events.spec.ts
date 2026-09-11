import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { defineSpecification } from "@agentxm/specification-metadata";

import { makeSpecContext, makeSpecWorkspace } from "./__tests__/plan-spec-support.js";
import {
  OperationLifecycle,
  makeOperationLifecycle,
  subscribeLossless,
  type OperationEvent,
} from "./operation-events.js";
import { StepFailure } from "./errors.js";
import { deriveOperationOutcome } from "./operation-resolution.js";
import type { Plan } from "./plan.js";
import { preapprovedPlanExecution } from "./plan-execution-fixtures.js";
import { prepareExecutionCandidate, resolveExecutionCandidate } from "./resolve-plan.js";

export const specification = defineSpecification({
  requirement: "cli/long-running-operations-emit-lifecycle-events",
  title: "A plan-family operation publishes its lifecycle as typed events",
  statement:
    "A plan-family operation shall publish an operation-started event, a phase-started event for each phase it enters, a unit-started and a unit-resolved event for every unit it attempts, and exactly one settled event whose outcome equals the outcome of its result document.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  boundary: "memory",
  boundaryRationale:
    "The lifecycle is published by the operation itself; the transport that encodes it for automation is owned separately by cli/machine-progress-events-follow-the-lifecycle-schema.",
  methods: ["contract", "example"],
  derivedFrom: ["cli/machine-progress-events-follow-the-lifecycle-schema"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const makePlan = (args: {
  readonly name: string;
  readonly units: ReadonlyArray<{ readonly label: string; readonly fails?: boolean }>;
}): Plan => ({
  _tag: "Plan",
  name: args.name,
  description: Option.none(),
  jobs: [
    {
      concurrency: 1,
      executionPolicy: "best-effort",
      steps: args.units.map((unit) => ({
        readiness: "ready" as const,
        key: `skill:${unit.label}`,
        label: unit.label,
        run:
          unit.fails === true
            ? Effect.succeed({
                result: "error" as const,
                message: `${unit.label} failed`,
                error: new StepFailure({ category: "internal", detail: `${unit.label} failed` }),
              })
            : Effect.succeed({ result: "success" as const, message: `${unit.label} applied` }),
      })),
    },
  ],
});

/** Run one plan as an observed operation and collect what it published. */
const observe = (plan: Plan, workspaceDir: string, mode: "preview" | "apply") =>
  Effect.gen(function* () {
    const services = makeSpecContext(workspaceDir);
    const lifecycle = yield* makeOperationLifecycle({ name: plan.name, mode });
    const events: Array<OperationEvent> = [];
    yield* subscribeLossless(lifecycle, (event) => Effect.sync(() => void events.push(event)));
    yield* lifecycle.publish((seq, atMs) => ({
      _tag: "OperationStarted",
      seq,
      atMs,
      operationId: lifecycle.operationId,
      name: plan.name,
      mode,
    }));
    const resolution = yield* prepareExecutionCandidate(plan).pipe(
      Effect.flatMap((candidate) =>
        resolveExecutionCandidate(
          candidate,
          mode === "preview" ? { request: { mode: "preview" } } : preapprovedPlanExecution,
        ),
      ),
      Effect.provideService(OperationLifecycle, lifecycle),
      Effect.provide(services.layer),
    );
    yield* lifecycle.settle(deriveOperationOutcome(resolution));
    yield* lifecycle.drained.await;
    return { events, resolution };
  });

describe("A plan-family operation's lifecycle", () => {
  it.effect("publishes a start, its phases, every unit it attempts, and one settlement", () =>
    Effect.gen(function* () {
      const workspace = yield* makeSpecWorkspace("axm-lifecycle-events-");
      const { events, resolution } = yield* observe(
        makePlan({ name: "Install extensions", units: [{ label: "review" }, { label: "deploy" }] }),
        workspace.workspaceDir,
        "apply",
      );

      expect(events.filter((event) => event._tag === "OperationStarted")).toHaveLength(1);
      expect(
        events.flatMap((event) => (event._tag === "PhaseStarted" ? [event.phase] : [])),
      ).toEqual(["planning", "validation", "apply"]);

      // Every unit the resolution reports as attempted was announced and
      // resolved, in that order, with the state the document reports.
      const attempted = resolution.units.filter((unit) => unit.state !== "blocked");
      for (const unit of attempted) {
        const started = events.findIndex(
          (event) => event._tag === "UnitStarted" && event.unitId === unit.id,
        );
        const resolved = events.findIndex(
          (event) => event._tag === "UnitResolved" && event.unitId === unit.id,
        );
        expect(started, `${unit.id} started`).toBeGreaterThanOrEqual(0);
        expect(resolved, `${unit.id} resolved`).toBeGreaterThan(started);
        const resolvedEvent = events[resolved];
        expect(resolvedEvent?._tag === "UnitResolved" ? resolvedEvent.state : undefined).toBe(
          unit.state,
        );
      }

      const settled = events.filter((event) => event._tag === "OperationSettled");
      expect(settled).toHaveLength(1);
      expect(settled[0]?._tag === "OperationSettled" ? settled[0].outcome : undefined).toBe(
        deriveOperationOutcome(resolution),
      );
      expect(deriveOperationOutcome(resolution)).toBe("applied");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("settles a preview as previewed without entering the apply phase", () =>
    Effect.gen(function* () {
      const workspace = yield* makeSpecWorkspace("axm-lifecycle-preview-");
      const { events, resolution } = yield* observe(
        makePlan({ name: "Install extensions", units: [{ label: "review" }] }),
        workspace.workspaceDir,
        "preview",
      );

      expect(
        events.flatMap((event) => (event._tag === "PhaseStarted" ? [event.phase] : [])),
      ).not.toContain("apply");
      const settled = events.filter((event) => event._tag === "OperationSettled");
      expect(settled).toHaveLength(1);
      expect(settled[0]?._tag === "OperationSettled" ? settled[0].outcome : undefined).toBe(
        deriveOperationOutcome(resolution),
      );
      expect(deriveOperationOutcome(resolution)).toBe("previewed");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("settles an operation with nothing to do as a no-op", () =>
    Effect.gen(function* () {
      const workspace = yield* makeSpecWorkspace("axm-lifecycle-noop-");
      const { events, resolution } = yield* observe(
        makePlan({ name: "Install extensions", units: [] }),
        workspace.workspaceDir,
        "apply",
      );

      const settled = events.filter((event) => event._tag === "OperationSettled");
      expect(settled).toHaveLength(1);
      expect(settled[0]?._tag === "OperationSettled" ? settled[0].outcome : undefined).toBe(
        deriveOperationOutcome(resolution),
      );
      expect(deriveOperationOutcome(resolution)).toBe("no-op");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
