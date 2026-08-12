import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { WorkspaceReadModelTest } from "../../../workspace/read-model/__fixtures__/test-layer.js";
import { makeWorkspaceReadModel } from "../../../workspace/read-model/service.js";
import type { DesiredExtensionNode } from "../../../workspace/desired-state-graph.js";
import type { WorkspaceRuleContext } from "../../context.js";
import { authoredContentUnpublishedRule } from "./authored-content-unpublished.js";

const desired = {
  type: "skill",
  name: "draft-skill",
  identity: "workspace:@test/skills/draft-skill",
  source: "workspace:@test/skills/draft-skill",
  enabled: true,
  constraints: [],
  origins: [],
} satisfies DesiredExtensionNode;

const makeContext: Effect.Effect<WorkspaceRuleContext> = Effect.gen(function* () {
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
            path: "/workspace/.axm/extensions/draft-skill",
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

describe("workspace/authored-content-unpublished", () => {
  it.effect("recommends publish as a non-blocking warning", () =>
    Effect.gen(function* () {
      const context = yield* makeContext;
      const findings = yield* authoredContentUnpublishedRule.check(context);

      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        severity: "warning",
        suggestions: [
          {
            description: "Publish the working version; publishing preserves authored content",
            cmd: "axm publish @test/skills/draft-skill",
          },
        ],
      });
      expect(findings[0]?.message).toContain(
        "modified since its last recorded authoring/publish baseline",
      );
      expect(findings[0]?.message).not.toContain("axm publish");
      expect(findings[0]?.message).not.toContain("axm sync");
    }),
  );
});
