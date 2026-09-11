import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  deriveOperationOutcome,
  previewPlanExecution,
  type PlanExecution,
} from "@agentxm/workspace-operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-operations/testing";
import { defineSpecification } from "@agentxm/specification-metadata";

import { BundledAxmSkillAsset } from "../skills/install/bundled.js";
import { makeLifecycleFixture } from "../testing.js";
import { applyInstall, installRequest } from "../install/test-helpers.js";
import { UpdateExtensions } from "./update-extensions.js";
import { targetedUpdateRequest } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/update/bundled-source-routes-to-recovery",
  title: "Targeted update routes bundled source to its converging recovery",
  statement:
    "When a targeted update names an extension whose source is bundled with the AXM executable, the update shall be blocked in preview and apply as a policy exclusion naming the bundled source, without contacting any Registry or changing workspace state, and the blocked outcome shall carry the bundled source as the fact a recovery route is offered for.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "cli/update/machine-result-names-bundled-source-blocker",
    // The argv a person types to recover is the adapter's, and is asserted
    // beside the table that renders it.
    "apps/cli/src/root/update/blocker-suggestions.test.ts",
  ],
  supersedes: ["cli/update/machine-result-names-bundled-source-blocker"],
  assumptions: [],
  openQuestions: [],
});

const AXM_SKILL = "@agentxm/skills/axm";

/**
 * The official skill as a compatible executable carries it: an exact release
 * and a bounded range, which is what the product requires before it will
 * install the embedded copy.
 */
const compatibleBundledAsset = Layer.succeed(BundledAxmSkillAsset, {
  manifestJson: `${JSON.stringify(
    {
      owner: "@agentxm",
      type: "skill",
      name: "axm",
      version: "1.0.0",
      description: "The official AXM skill.",
    },
    null,
    2,
  )}\n`,
  version: "1.0.0",
  cliVersion: "1.0.0",
  cliVersionRange: ">=1.0.0 <2.0.0",
  sourceFiles: [
    {
      path: "SKILL.md",
      base64: Buffer.from(
        "---\nname: axm\ndescription: The official AXM skill.\n---\n\n# axm\n",
      ).toString("base64"),
    },
  ],
  runningCliVersion: "1.0.0",
});

describe("Targeted update of a bundled official skill", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("is blocked without Registry access in preview and in apply", () => {
    // `sources: "none"` is a source world that refuses: every fetch and every
    // named-registry lookup dies, so a run that reached for a Registry fails
    // this example instead of quietly succeeding.
    const workspace = makeLifecycleFixture({
      sources: "none",
      settings: { owner: "@agentxm", agents: ["claude-code"] },
    });
    cleanups.push(workspace.cleanup);
    const modes: ReadonlyArray<{ readonly mode: string; readonly execution: PlanExecution }> = [
      { mode: "preview", execution: previewPlanExecution },
      { mode: "apply", execution: preapprovedPlanExecution },
    ];
    return workspace
      .provide(
        Effect.gen(function* () {
          const installed = yield* applyInstall(
            installRequest({
              type: "skill",
              subject: { kind: "bundled" },
              planName: "Install bundled AXM skill",
            }),
          );
          expect(deriveOperationOutcome(installed)).toBe("applied");
          const before = workspace.snapshot();

          for (const { mode, execution } of modes) {
            const candidate = yield* UpdateExtensions.prepare(
              targetedUpdateRequest({ source: AXM_SKILL }),
            );

            expect(candidate.outcome, mode).toBe("blocked");
            if (candidate.outcome !== "blocked") return;
            expect(candidate.blockingClass, mode).toBe("policy-excluded");
            expect(candidate.reference, mode).toBe("bundled-source");
            expect(candidate.targetedContext?.blocker, mode).toBe("bundled-source");
            expect(candidate.detail, mode).toContain("embedded in this AXM executable");

            const resolution = yield* UpdateExtensions.previewOrApply(candidate, execution);

            expect(deriveOperationOutcome(resolution), mode).toBe("blocked");
            expect(resolution.blocking, mode).toMatchObject({
              class: "policy-excluded",
              reference: "bundled-source",
              subject: AXM_SKILL,
            });
            expect(resolution.units, mode).toEqual([]);
            // The unchanged-state ledger, after each mode: settings, the
            // lockfile, canonical content and the agent projection all stand.
            expect(workspace.snapshot(), mode).toEqual(before);
          }
        }).pipe(Effect.provide(compatibleBundledAsset)),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
