import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  ProjectionParticipants,
  ProjectionParticipantFailed,
  WorkspaceInvariantFacts,
} from "@agentxm/workspace-kernel/projection";
import { WorkspaceInvariantFactsLive } from "@agentxm/workspace-kernel/projection/live";
import { DesiredStateReader } from "@agentxm/workspace-kernel/workspace-state";
import { makeAxmSkillCompatibilityPolicyLayer } from "@agentxm/cli-maintenance/official-skill/composition";
import { makeSyncFixture } from "../../testing/sync-fixture.js";

it.effect("bounds projection participant reads while retaining the aggregate owner", () => {
  const workspace = makeSyncFixture();
  let ruleReads = 0;
  // The participant seam establishes dispatch boundaries, not native adapter correctness.
  const program = Effect.gen(function* () {
    const graph = yield* (yield* DesiredStateReader).graph();
    const owner = yield* WorkspaceInvariantFacts;
    yield* owner.projectionFactsForGraph(graph, [{ type: "rule", name: "review" }]);
    expect(ruleReads).toBe(1);
    yield* owner.projectionFactsForGraph(graph, [{ type: "skill", name: "review" }]);
    yield* owner.projectionFactsForGraph(graph, []);
    expect(ruleReads).toBe(1);
  }).pipe(
    Effect.provide(Layer.fresh(WorkspaceInvariantFactsLive)),
    Effect.provideService(ProjectionParticipants, {
      aggregates: [
        {
          units: ["rule:instructions-region"],
          projectionPlans: () =>
            Effect.sync(() => {
              ruleReads++;
              return [];
            }),
        },
        {
          units: ["hook:agent-hook-entries"],
          projectionPlans: () => Effect.die("Unrelated hook owner was read"),
        },
      ],
      subagents: Option.none(),
    }),
  );
  return workspace
    .provide(program)
    .pipe(
      Effect.provide(
        Layer.merge(NodeServices.layer, makeAxmSkillCompatibilityPolicyLayer("1.0.0")),
      ),
      Effect.ensuring(Effect.sync(workspace.cleanup)),
    );
});

it.effect(
  "retains aggregate read failures when an unrelated contributor type is incomplete",
  () => {
    const workspace = makeSyncFixture({
      settings: { owner: "@acme", agents: [], rules: { review: { source: "workspace" } } },
      files: {
        "rules/review/rule.json": JSON.stringify({
          type: "rule",
          name: "review",
          owner: "@acme",
          version: "1.0.0",
          title: "Review",
          description: "Review changes",
        }),
        "rules/review/src/RULE.md": "Record review risks.\n",
      },
    });
    // The participant seam supplies a native read failure. The graph retains a
    // real rule contributor plus a problem confined to another extension type.
    const program = Effect.gen(function* () {
      const graph = yield* (yield* DesiredStateReader).graph();
      const owner = yield* WorkspaceInvariantFacts;
      const facts = yield* owner.projectionFactsForGraph(
        {
          ...graph,
          problems: [
            ...graph.problems,
            {
              type: "workspace-owner-missing",
              extensionType: "subagent",
              name: "unrelated",
            },
          ],
        },
        [{ type: "rule", name: "review" }],
      );
      expect(facts).toHaveLength(1);
      expect(facts[0]).toMatchObject({
        subject: { unitId: "rule:instructions-region" },
        authority: { contributors: ["workspace:@acme/rules/review"] },
        observation: { status: "unavailable" },
      });
    }).pipe(
      Effect.provide(Layer.fresh(WorkspaceInvariantFactsLive)),
      Effect.provideService(ProjectionParticipants, {
        aggregates: [
          {
            units: ["rule:instructions-region"],
            projectionPlans: () =>
              Effect.fail(
                new ProjectionParticipantFailed({
                  unitId: "rule:instructions-region",
                  detail: "Native output is unreadable",
                }),
              ),
          },
        ],
        subagents: Option.none(),
      }),
    );
    return workspace
      .provide(program)
      .pipe(
        Effect.provide(
          Layer.merge(NodeServices.layer, makeAxmSkillCompatibilityPolicyLayer("1.0.0")),
        ),
        Effect.ensuring(Effect.sync(workspace.cleanup)),
      );
  },
);
