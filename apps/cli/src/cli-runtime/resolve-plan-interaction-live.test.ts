import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { ResolvePlanInteraction, type Plan } from "@agentxm/workspace/transitions/planning";

import { TestFlagsLayer } from "../cli-flags/index.js";
import { TestRenderer } from "../test-support/presenter-test.js";
import { ResolvePlanInteractionLive } from "./resolve-plan-interaction-live.js";
import { Screen, OutputWriteFailed } from "../screen/index.js";

const plan: Plan = {
  _tag: "Plan",
  name: "Sync workspace",
  description: Option.none(),
  riskConditions: [
    {
      level: "confirmable",
      id: "source-change",
      detail: "Review the changed source before applying.",
    },
  ],
  jobs: [
    {
      concurrency: 1,
      steps: [
        {
          readiness: "ready",
          label: "@acme/skills/review",
          run: Effect.succeed({ result: "success", message: "Installed" }),
        },
      ],
    },
  ],
};

const harness = () => {
  const renderer = TestRenderer.make();
  const dependencies = Layer.merge(renderer.layer, TestFlagsLayer({ nonInteractive: false }));
  const layer = Layer.merge(
    dependencies,
    ResolvePlanInteractionLive.pipe(Layer.provide(dependencies)),
  );
  return { layer, state: renderer.state };
};

describe("ResolvePlanInteractionLive", () => {
  it.effect("propagates failed plan and confirmation delivery as typed interaction failures", () =>
    Effect.gen(function* () {
      const renderer = TestRenderer.make();
      const screen = yield* Screen.pipe(Effect.provide(renderer.layer));
      const cause = new OutputWriteFailed({ channel: "stderr", reason: "EPIPE" });
      const dependencies = Layer.merge(
        Layer.succeed(Screen, {
          ...screen,
          note: () => Effect.fail(cause),
          ask: () => Effect.fail(cause),
        }),
        TestFlagsLayer({ nonInteractive: false }),
      );
      yield* Effect.gen(function* () {
        const interaction = yield* ResolvePlanInteraction;
        const presented = yield* Effect.flip(interaction.presentPlan(plan, { mode: "apply" }));
        const confirmed = yield* Effect.flip(
          interaction.confirmApplyChanges({ command: ["sync"], arguments: [] }),
        );
        expect(presented).toMatchObject({
          _tag: "PlanInteractionFailed",
          category: "internal",
          cause,
        });
        expect(confirmed).toMatchObject({
          _tag: "PlanInteractionFailed",
          category: "internal",
          cause,
        });
      }).pipe(Effect.provide(Layer.provide(ResolvePlanInteractionLive, dependencies)));
    }),
  );
  it.effect("reopens the presented plan for details, then honors the guarded answer", () => {
    const test = harness();
    test.state.script.answers.push({ _tag: "Confirm", key: "d" }, { _tag: "Confirm", key: "y" });
    return Effect.gen(function* () {
      const interaction = yield* ResolvePlanInteraction;
      yield* interaction.presentPlan(plan, { mode: "apply" });
      const answer = yield* interaction.confirmApplyChanges({ command: ["sync"], arguments: [] });

      expect(answer).toBe("approved");
      expect(test.state.script.asks).toHaveLength(2);
      expect(test.state.script.views.length).toBeGreaterThanOrEqual(2);
      expect(test.state.script.guards).toHaveLength(2);
      expect(test.state.script.guards[0]?.message).toBe("Apply changes?");
      expect(test.state.docs.length).toBeGreaterThanOrEqual(2);
    }).pipe(Effect.provide(test.layer));
  });

  it.effect("maps an explicit cancellation to the interaction result", () => {
    const test = harness();
    test.state.script.answers.push({ _tag: "Cancel" });
    return Effect.gen(function* () {
      const interaction = yield* ResolvePlanInteraction;
      expect(yield* interaction.isConfirmationAvailable).toBe(true);
      expect(yield* interaction.confirmApplyChanges({ command: ["sync"], arguments: [] })).toBe(
        "cancelled",
      );
    }).pipe(Effect.provide(test.layer));
  });
});
