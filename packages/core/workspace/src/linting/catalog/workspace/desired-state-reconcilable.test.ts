import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { WorkspaceReadModelTest } from "../../../desired-state/testing.js";
import { makeWorkspaceReadModel } from "../../../desired-state/index.js";
import type { DesiredExtensionNode } from "../../../desired-state/index.js";
import type { WorkspaceRuleContext } from "../../workspace-context.js";
import type { CanonicalObservation } from "../../../desired-state/index.js";
import { desiredStateReconcilableRule } from "./desired-state-reconcilable.js";

const makeContext = (
  desired: DesiredExtensionNode,
  observation: CanonicalObservation,
): Effect.Effect<WorkspaceRuleContext> =>
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
          mcpSourceClosures: [],
          problems: [],
        }),
        canonicalObservations: Effect.succeed([
          {
            desired,
            observation,
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

const runCheckWithObservation = (
  desired: DesiredExtensionNode,
  observation: CanonicalObservation,
) =>
  Effect.gen(function* () {
    const context = yield* makeContext(desired, observation);
    return yield* desiredStateReconcilableRule.check(context);
  });

describe("workspace/desired-state-reconcilable canonical modifications", () => {
  it.effect("describes a materialized package-tree integrity mismatch", () => {
    const desired = {
      type: "skill",
      name: "installed-skill",
      identity: "@test/skills/installed-skill",
      source: "@test/skills/installed-skill@1.0.0",
      enabled: true,
      constraints: ["1.0.0"],
      origins: [],
    } satisfies DesiredExtensionNode;
    const observation = {
      type: "skill",
      name: "installed-skill",
      status: "materialization-mismatch",
      path: "/workspace/agent_extensions/registry/@test/skills/installed-skill",
    } satisfies CanonicalObservation;

    return Effect.gen(function* () {
      const findings = yield* runCheckWithObservation(desired, observation);

      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        severity: "error",
        message:
          "skill '@test/skills/installed-skill' differs from its accepted materialized package-tree integrity.",
      });
    });
  });

  it.effect("names every depending Pack and range for a constraint mismatch", () => {
    const desired = {
      type: "skill",
      name: "review",
      identity: "@test/skills/review",
      source: "@test/skills/review@^2.0.0",
      enabled: true,
      constraints: ["^2.0.0"],
      origins: [],
    } satisfies DesiredExtensionNode;
    const observation = {
      type: "skill",
      name: "review",
      status: "constraint-mismatch",
      acceptedVersion: "1.0.0",
      observedVersion: "1.0.0",
      authority: {
        source: "desired-state-graph",
        identity: desired.identity,
        locator: desired.source,
        constraints: [
          {
            source: "pack",
            dependingPack: "@test/packs/alpha",
            range: "^2.0.0",
            location: "/workspace/agent_extensions/@test/packs/alpha/pack.json",
          },
        ],
      },
    } satisfies CanonicalObservation;

    return Effect.gen(function* () {
      const findings = yield* runCheckWithObservation(desired, observation);

      expect(findings).toHaveLength(1);
      expect(findings[0]?.message).toContain("@test/packs/alpha range=^2.0.0");
      expect(findings[0]?.message).toContain("accepted version=1.0.0");
      expect(findings[0]?.message).toContain("observed version=1.0.0");
      expect(findings[0]?.message).toContain("decision=reconcilable");
    });
  });
});
