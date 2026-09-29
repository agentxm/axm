import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome, previewPlanExecution } from "@agentxm/workspace-kernel/operations";
import { AdoptInstructionRegion } from "../index.js";
import { makeConfigurationFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/instructions/adopt/preview-is-pure",
  title: "Instruction region adoption preview leaves both scopes unchanged",
  statement:
    "When instruction region adoption runs in preview mode, AXM shall report the exact ownership transfer it would apply with a previewed outcome, without modifying instruction files, canonical sources, settings, accepted resolutions, or any other state in the selected or unselected scope. A refused preview shall also leave both scopes unchanged.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  boundary: "platform",
  boundaryRationale:
    "Byte-identical snapshots of both scopes establish that native files and accepted sources remain unchanged.",
  methods: ["example", "decision-table"],
  derivedFrom: ["cli/instructions/adopt/records-exact-scoped-authority"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Instruction region adoption preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  for (const valid of [true, false]) {
    it.effect(`preserves both scopes when the preview ${valid ? "is ready" : "is refused"}`, () => {
      const world = makeConfigurationFixture({
        settings: { owner: "@acme", agents: ["codex"], rules: { guide: "workspace" } },
        files: {
          "AGENTS.md": valid
            ? "<!-- axm:start v=1 region=rules ext=@agentxm/rules/instructions -->\nExisting body\n<!-- axm:end v=1 region=rules -->\n"
            : "# Authored instructions\n",
          "rules/guide/rule.json": JSON.stringify({
            owner: "@acme",
            type: "rule",
            name: "guide",
            version: "1.0.0",
          }),
          "rules/guide/src/RULE.md": "Canonical guide body.\n",
        },
        homeFiles: { ".axm/workspace/axm.json": "{}\n", "AGENTS.md": "# User instructions\n" },
      });
      cleanups.push(world.cleanup);
      return world
        .provide(
          Effect.gen(function* () {
            const before = world.snapshot();
            const homeBefore = world.homeSnapshot();
            const prepared = yield* AdoptInstructionRegion.prepare({
              region: "rules",
              fileName: "AGENTS.md",
            }).pipe(Effect.result);
            expect(prepared._tag).toBe(valid ? "Success" : "Failure");
            if (prepared._tag === "Success") {
              expect(
                deriveOperationOutcome(
                  yield* AdoptInstructionRegion.previewOrApply(
                    prepared.success,
                    previewPlanExecution,
                  ),
                ),
              ).toBe("previewed");
            }
            expect(world.snapshot()).toEqual(before);
            expect(world.homeSnapshot()).toEqual(homeBefore);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    });
  }
});
