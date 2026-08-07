import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { WorkspaceReadModelTest } from "../../../workspace/read-model/__fixtures__/test-layer.js";
import { makeWorkspaceReadModel } from "../../../workspace/read-model/service.js";
import type { DesiredExtensionNode } from "../../../workspace/desired-state-graph.js";
import type { WorkspaceRuleContext } from "../../context.js";
import { desiredStateReconcilableRule } from "./desired-state-reconcilable.js";

const makeContext = (desired: DesiredExtensionNode): Effect.Effect<WorkspaceRuleContext> =>
  Effect.gen(function* () {
    const workspace = yield* makeWorkspaceReadModel("project");
    return {
      subject: { root: "/workspace", scope: "project" },
      workspace,
      axmDirExists: Effect.succeed(true),
      health: {
        desiredState: Effect.succeed({
          complete: true,
          nodes: [desired],
          problems: [],
        }),
        canonicalObservations: Effect.succeed([
          {
            desired,
            observation: {
              type: desired.type,
              name: desired.name,
              status: "locally-modified",
              path: `/workspace/.axm/extensions/${desired.name}`,
              contentIdentity: "sha256-working",
            },
          },
        ]),
      },
      displayRoot: "",
    } satisfies WorkspaceRuleContext;
  }).pipe(
    Effect.provide(
      WorkspaceReadModelTest({
        workspaceRoot: "/workspace",
        userHome: "/user",
      }),
    ),
    Effect.orDie,
  );

const runCheck = (desired: DesiredExtensionNode) =>
  Effect.gen(function* () {
    const context = yield* makeContext(desired);
    return yield* desiredStateReconcilableRule.check(context);
  });

describe("workspace/desired-state-reconcilable canonical modifications", () => {
  it.effect("does not classify workspace-authored changes as blocking drift", () => {
    const desired = {
      type: "skill",
      name: "draft-skill",
      identity: "workspace:@test/skills/draft-skill",
      source: "workspace:@test/skills/draft-skill",
      enabled: true,
      constraints: [],
      origins: [],
    } satisfies DesiredExtensionNode;

    return Effect.gen(function* () {
      const findings = yield* runCheck(desired);

      expect(findings).toEqual([]);
    });
  });

  it.effect("keeps trusted-source modifications blocking with explicit discard framing", () => {
    const desired = {
      type: "skill",
      name: "installed-skill",
      identity: "@test/skills/installed-skill",
      source: "@test/skills/installed-skill@1.0.0",
      enabled: true,
      constraints: ["1.0.0"],
      origins: [],
    } satisfies DesiredExtensionNode;

    return Effect.gen(function* () {
      const findings = yield* runCheck(desired);

      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        severity: "error",
        message: expect.stringContaining("axm sync @test/skills/installed-skill --preview"),
      });
      expect(findings[0]?.message).toContain("discards these local modifications");
    });
  });
});
