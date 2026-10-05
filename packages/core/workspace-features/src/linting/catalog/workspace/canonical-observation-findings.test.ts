import { fileRegistryPackagePath } from "../../../testing/install-world.js";
import * as fs from "node:fs";
import {
  desiredPackageKey,
  UNCONSTRAINED_DESIRED_NODE,
  type CanonicalObservation,
  type DesiredExtensionNode,
} from "@agentxm/workspace-kernel/workspace-state";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { NoProjectionParticipants } from "@agentxm/workspace-kernel/projection/testing";
import {
  applySync,
  makeFileRegistry,
  makeSyncFixture,
  type SyncFixture,
} from "../../../testing/sync-fixture.js";
import { queryLintWorkspace } from "../../index.js";
import { OfflineHttpClient } from "../../test-helpers.js";
import { lintWorkspaceServices } from "../../testing.js";
import { nodesDeferringToObservation } from "./canonical-observation-findings.js";

const desired = {
  type: "skill",
  name: "review",
  identity: {
    authority: "registry",
    fqn: "@acme/skills/review",
    registry: { sourceName: undefined, endpoint: undefined },
  },
  source: "@acme/skills/review",
  enabled: true,
  constraint: UNCONSTRAINED_DESIRED_NODE,
  origins: [
    {
      type: "settings",
      localName: "review",
      authority: "sourced",
      source: "@acme/skills/review",
      enabled: true,
    },
  ],
} satisfies DesiredExtensionNode;

const observed = (observation: CanonicalObservation) => ({ desired, observation });

describe("nodesDeferringToObservation", () => {
  it.each(["missing", "missing-resolution"] as const)(
    "defers a node observed %s, whose canonical tree is absent",
    (status) => {
      expect(
        nodesDeferringToObservation([observed({ type: "skill", name: "review", status })]),
      ).toEqual(new Set(["skill:review"]));
    },
  );

  it.each([
    "usable",
    "not-applicable",
    "incomplete",
    "corrupt",
    "wrong-origin",
    "materialization-mismatch",
  ] as const)("keeps the per-extension rules of a node observed %s", (status) => {
    expect(
      nodesDeferringToObservation([observed({ type: "skill", name: "review", status })]),
    ).toEqual(new Set());
  });

  it("keeps the per-extension rules of a node observed constraint-mismatch", () => {
    expect(
      nodesDeferringToObservation([
        observed({
          type: "skill",
          name: "review",
          status: "constraint-mismatch",
          authority: {
            source: "desired-state-graph",
            identity: desiredPackageKey(desired.identity),
            locator: desired.source,
            constraints: [],
          },
        }),
      ]),
    ).toEqual(new Set());
  });
});

describe("per-extension rules over present but unusable canonical content", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /** Every finding for the fixture's project, as rule and message. */
  const findings = (workspace: SyncFixture) =>
    queryLintWorkspace(
      {
        workspaceRoot: workspace.root,
        userHome: workspace.home,
        scope: "project",
        input: { view: "workspace" },
        nativeView: { kind: "workspace" },
        fix: false,
      },
      { strict: false },
    ).pipe(
      Effect.scoped,
      Effect.provide(
        lintWorkspaceServices({ workspaceRoot: workspace.root }).pipe(
          Layer.provideMerge(
            Layer.mergeAll(NodeServices.layer, OfflineHttpClient, NoProjectionParticipants),
          ),
        ),
      ),
      Effect.map(({ document }) =>
        document.findings.map(({ ruleId, message }) => ({ ruleId, message })),
      ),
    );

  /** A realized direct Skill whose acquired manifest the example then damages. */
  const realizedSkill = () => {
    const registry = makeFileRegistry();
    cleanups.push(registry.cleanup);
    registry.writeSkill("review", [{ version: "1.0.0", body: "Review." }]);
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        sources: [registry.source],
        skills: { review: "test:@acme/skills/review@^1.0.0" },
      },
    });
    cleanups.push(workspace.cleanup);
    const manifestPath = nodePath.join(
      workspace.root,
      `${fileRegistryPackagePath(registry, "skills", "review")}/skill.json`,
    );
    return { workspace, manifestPath };
  };

  it.effect(
    "reports incomplete acquired state without asking the consumer to author a manifest",
    () => {
      const { workspace, manifestPath } = realizedSkill();
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();
            fs.rmSync(manifestPath);

            const reported = yield* findings(workspace);
            expect(reported).toEqual(
              expect.arrayContaining([
                {
                  ruleId: "workspace/desired-state-reconcilable",
                  message: expect.stringContaining("has canonical state incomplete"),
                },
              ]),
            );
            expect(reported.some(({ ruleId }) => ruleId === "skill/manifest-present")).toBe(true);
            expect(reported.some(({ message }) => message.includes("Create skill.json"))).toBe(
              false,
            );
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("reports corrupt acquired state without applying authoring conformance", () => {
    const { workspace, manifestPath } = realizedSkill();
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();
          fs.writeFileSync(manifestPath, "{ not-json");

          const reported = yield* findings(workspace);
          expect(reported).toEqual(
            expect.arrayContaining([
              {
                ruleId: "workspace/desired-state-reconcilable",
                message: expect.stringContaining("has canonical state corrupt"),
              },
            ]),
          );
          expect(reported.some(({ ruleId }) => ruleId === "skill/manifest-schema-valid")).toBe(
            true,
          );
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
