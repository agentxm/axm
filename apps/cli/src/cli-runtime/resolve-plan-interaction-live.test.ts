import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { ResolvePlanInteraction, type Plan } from "@agentxm/workspace/transitions/planning";

import { TestFlagsLayer } from "../cli-flags/index.js";
import { handleDemote } from "../root/demote/command.js";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../test-support/install-harness.js";
import { TestRenderer } from "../test-support/presenter-test.js";
import { writeAuthoredSkill } from "../test-support/publish-harness.js";
import { humanScreenLayer, makeRecordingStreams } from "../test-support/screen-harness.js";
import { snapshotWorkspaceContent } from "../test-support/workspace-fixtures.js";
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
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  // Planning reads the screen's one decision, so a terminal that cannot paint
  // a prompt closes the confirmation before any question is raised.
  it.effect.each([
    { stderrIsTTY: true, expected: true },
    { stderrIsTTY: false, expected: false },
  ])(
    "answers isConfirmationAvailable $expected when stderr is a tty: $stderrIsTTY",
    ({ stderrIsTTY, expected }) =>
      Effect.gen(function* () {
        const interaction = yield* ResolvePlanInteraction;
        expect(yield* interaction.isConfirmationAvailable).toBe(expected);
      }).pipe(
        Effect.provide(
          ResolvePlanInteractionLive.pipe(
            Layer.provideMerge(
              Layer.merge(
                humanScreenLayer(makeRecordingStreams({ stdoutIsTTY: true, stderrIsTTY })),
                TestFlagsLayer({ nonInteractive: false }),
              ),
            ),
          ),
        ),
      ),
  );

  it.effect(
    "blocks an apply at planning with the interactive recovery when stderr cannot paint a prompt",
    () =>
      Effect.gen(function* () {
        // Stdin is a terminal and no non-interactive flag is given, so the
        // flags alone would let a prompt open; only stderr, redirected to a
        // file, cannot paint one. The block names the interactive rerun and
        // no question reaches the screen.
        const workspace = makeSpecWorkspace({
          screen: { kind: "human", stdoutIsTTY: true, stderrIsTTY: false },
          flags: { nonInteractive: false },
          settings: { owner: "@acme", skills: { review: "workspace" } },
        });
        cleanups.push(workspace.cleanup);
        writeAuthoredSkill(workspace.root, { name: "review" });
        const replacement = writeLocalSkillPackage(workspace.root, {
          name: "review",
          body: "Replacement guidance.",
        });
        const before = snapshotWorkspaceContent(workspace.root);

        yield* handleDemote({
          fqn: "@acme/skills/review",
          source: replacement,
          yes: false,
          preview: false,
        }).pipe(Effect.provide(Layer.provideMerge(ResolvePlanInteractionLive, workspace.layer)));

        // Stdout is a styled terminal, so the words are read without their styling.
        const output = [
          ...(workspace.streams?.lines("stdout") ?? []),
          ...(workspace.streams?.lines("stderr") ?? []),
        ]
          .join("\n")
          .replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "gu"), "");
        // The block is planning's own outcome with the route's recovery — the
        // same one a non-interactive invocation gets — not a late prompt failure.
        expect(output).toContain("approval is required");
        expect(output).toContain("axm demote --yes @acme/skills/review");
        expect(output).not.toContain("Interactive prompt required");
        expect(output).not.toContain("Apply changes?");
        expect(snapshotWorkspaceContent(workspace.root)).toEqual(before);
      }),
  );

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
