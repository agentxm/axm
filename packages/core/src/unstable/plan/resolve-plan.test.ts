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

const makeTestLayer = () => {
  const { layer } = makeTestContext();
  return layer;
};

const makeTestContext = () => {
  const renderer = TestRenderer.make();
  const interaction = ResolvePlanInteractionTest();

  return {
    layer: Layer.mergeAll(
      NodeServices.layer,
      renderer.layer,
      TestFlagsLayer({ nonInteractive: true }),
      Layer.succeed(WorkspaceMutations, makeBaseWorkspaceMock("/tmp/axm-preview/.axm")),
      interaction.layer,
    ),
    rendererState: renderer.state,
  };
};

describe("previewOrApplyPlan", () => {
  it.effect("--preview --yes remains a dry run", () => {
    let appliedCount = 0;
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
        force: false,
        preview: true,
      });

      expect(result._tag).toBe("PreviewedPlan");
      expect(appliedCount).toBe(0);
    }).pipe(Effect.provide(makeTestLayer()));
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
        force: false,
        preview: false,
      });

      expect(context.rendererState.spinnerMessages).toEqual([
        "Resolving Install skill",
        "Resolved Install skill",
        "Applying Install skill",
        "Finished applying Install skill",
      ]);
    }).pipe(Effect.provide(context.layer));
  });
});
