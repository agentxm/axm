import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { WorkspaceReadModelTest } from "../../../workspace/read-model/__fixtures__/test-layer.js";
import { makeWorkspaceReadModel } from "../../../workspace/read-model/service.js";
import type { DesiredExtensionNode } from "../../../workspace/desired-state-graph.js";
import type { WorkspaceRuleContext } from "../../context.js";
import type { CanonicalObservation } from "../../../workspace/canonical-observation.js";
import { desiredStateReconcilableRule } from "./desired-state-reconcilable.js";

const makeContext = (
  desired: DesiredExtensionNode,
  observation: CanonicalObservation = {
    type: desired.type,
    name: desired.name,
    status: "locally-modified",
    path: `/workspace/skills/${desired.name}`,
    contentIdentity: "sha256-working",
  },
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

const runCheck = (desired: DesiredExtensionNode) =>
  Effect.gen(function* () {
    const context = yield* makeContext(desired);
    return yield* desiredStateReconcilableRule.check(context);
  });

const runCheckWithObservation = (
  desired: DesiredExtensionNode,
  observation: CanonicalObservation,
) =>
  Effect.gen(function* () {
    const context = yield* makeContext(desired, observation);
    return yield* desiredStateReconcilableRule.check(context);
  });

describe("workspace/desired-state-reconcilable canonical modifications", () => {
  it.effect("does not classify workspace-authored changes as blocking drift", () => {
    const desired = {
      type: "skill",
      name: "draft-skill",
      identity: "workspace:@test/skills/draft-skill",
      source: "workspace",
      enabled: true,
      constraints: [],
      origins: [],
    } satisfies DesiredExtensionNode;

    return Effect.gen(function* () {
      const findings = yield* runCheck(desired);

      expect(findings).toEqual([]);
    });
  });

  it.effect("reports external canonical modifications as a fact without workflow guidance", () => {
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
        message: "skill '@test/skills/installed-skill' has canonical state locally-modified.",
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
