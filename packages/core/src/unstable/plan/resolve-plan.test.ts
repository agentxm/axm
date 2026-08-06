import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { TestFlagsLayer } from "../cli-flags/index.js";
import { TestRenderer } from "../cli-renderer/index.js";
import { WorkspaceMutations } from "../workspace/index.js";
import { ResolvePlanInteractionTest } from "../workspace/resolve-plan-interaction.js";
import { makeBaseWorkspaceMock } from "../workspace/test-stubs.js";
import type { Plan } from "./plan.js";
import { previewOrApplyPlan } from "./resolve-plan.js";

const makeTestContext = (
  confirmApplyChanges?: () => Effect.Effect<boolean>,
  flagsOverrides?: { readonly quiet?: boolean },
) => {
  const renderer = TestRenderer.make();
  const interaction = ResolvePlanInteractionTest(
    confirmApplyChanges === undefined ? undefined : { confirmApplyChanges },
  );

  return {
    layer: Layer.mergeAll(
      NodeServices.layer,
      renderer.layer,
      TestFlagsLayer({ nonInteractive: true, ...flagsOverrides }),
      Layer.succeed(WorkspaceMutations, makeBaseWorkspaceMock("/tmp/axm-preview/.axm")),
      interaction.layer,
    ),
    rendererState: renderer.state,
    interactionState: interaction.state,
  };
};

describe("previewOrApplyPlan", () => {
  it.effect("--preview --yes remains a dry run", () => {
    let appliedCount = 0;
    const context = makeTestContext();
    const plan: Plan = {
      _tag: "Plan",
      name: "Install skill",
      description: Option.none(),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "ready",
              label: "code-review",
              run: Effect.sync(() => {
                appliedCount += 1;
                return { result: "success" as const, message: "installed" };
              }),
            },
          ],
        },
      ],
    };

    return Effect.gen(function* () {
      const result = yield* previewOrApplyPlan(plan, {
        yes: true,
        preview: true,
      });

      expect(result._tag).toBe("PreviewedPlan");
      expect(appliedCount).toBe(0);
      expect(context.interactionState.confirmApplyChangesCalls).toHaveLength(0);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("narrates plan resolution and apply phases with the plan subject", () => {
    const context = makeTestContext();
    const plan: Plan = {
      _tag: "Plan",
      name: "Install skill",
      description: Option.none(),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "ready",
              label: "code-review",
              run: Effect.succeed({ result: "success", message: "installed" }),
            },
          ],
        },
      ],
    };

    return Effect.gen(function* () {
      yield* previewOrApplyPlan(plan, {
        yes: true,
        preview: false,
      });

      expect(context.rendererState.spinnerMessages).toEqual([
        "Resolving Install skill",
        "Resolved Install skill",
        "Applying Install skill",
        "Processed Install skill",
      ]);
      expect(context.interactionState.confirmApplyChangesCalls).toHaveLength(0);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("suppresses the pre-apply plan for a pre-confirmed quiet apply", () => {
    const context = makeTestContext(undefined, { quiet: true });
    const plan: Plan = {
      _tag: "Plan",
      name: "Publish skill",
      description: Option.none(),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "ready",
              label: "code-review",
              run: Effect.succeed({ result: "success", message: "published" }),
            },
          ],
        },
      ],
    };

    return Effect.gen(function* () {
      yield* previewOrApplyPlan(plan, { yes: true, preview: false });

      expect(
        context.rendererState.logs.some(
          (entry) => entry._tag === "info" && entry.message.includes("Would publish"),
        ),
      ).toBe(false);
      expect(context.interactionState.confirmApplyChangesCalls).toHaveLength(0);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("displays the plan before confirmation and cancels without execution", () => {
    let appliedCount = 0;
    let displayedBeforeConfirmation = false;
    const context = makeTestContext(() =>
      Effect.sync(() => {
        displayedBeforeConfirmation = context.rendererState.logs.some(
          (entry) => entry._tag === "info" && entry.message.includes("Would install"),
        );
        return false;
      }),
    );
    const plan: Plan = {
      _tag: "Plan",
      name: "Install skill",
      description: Option.none(),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "ready",
              label: "code-review",
              run: Effect.sync(() => {
                appliedCount += 1;
                return { result: "success" as const, message: "installed" };
              }),
            },
          ],
        },
      ],
    };

    return Effect.gen(function* () {
      const result = yield* previewOrApplyPlan(plan, {
        yes: false,
        preview: false,
      });

      expect(result._tag).toBe("CancelledPlan");
      expect(displayedBeforeConfirmation).toBe(true);
      expect(context.interactionState.confirmApplyChangesCalls).toHaveLength(1);
      expect(appliedCount).toBe(0);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("rejects readiness errors before confirmation or execution", () => {
    let appliedCount = 0;
    const context = makeTestContext();
    const plan: Plan = {
      _tag: "Plan",
      name: "Install skills",
      description: Option.none(),
      jobs: [
        {
          concurrency: 1,
          steps: [
            {
              readiness: "ready",
              label: "safe-looking",
              run: Effect.sync(() => {
                appliedCount += 1;
                return { result: "success" as const, message: "installed" };
              }),
            },
            {
              readiness: "error",
              label: "invalid",
              errorMessage: "source is invalid",
            },
          ],
        },
      ],
    };

    return Effect.gen(function* () {
      const error = yield* previewOrApplyPlan(plan, {
        yes: true,
        preview: false,
      }).pipe(Effect.flip);

      expect(error).toMatchObject({ code: "conflict" });
      expect(context.interactionState.confirmApplyChangesCalls).toHaveLength(0);
      expect(appliedCount).toBe(0);
    }).pipe(Effect.provide(context.layer));
  });

  it.effect("does not prompt for an empty no-op plan", () => {
    const context = makeTestContext();
    const plan: Plan = {
      _tag: "Plan",
      name: "Install skills",
      description: Option.none(),
      jobs: [{ concurrency: 1, steps: [] }],
    };

    return Effect.gen(function* () {
      const result = yield* previewOrApplyPlan(plan, { yes: false, preview: false });

      expect(result._tag).toBe("ExecutedPlan");
      expect(context.interactionState.confirmApplyChangesCalls).toHaveLength(0);
    }).pipe(Effect.provide(context.layer));
  });
});
