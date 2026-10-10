import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome, previewPlanExecution } from "@agentxm/workspace-kernel/operations";
import { ConfigureHook } from "../index.js";
import { makeConfigurationFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/hooks/configure/preview-is-pure",
  title: "Hook extension configuration preview validates values without writing or executing code",
  statement:
    "When Hook extension configuration is previewed, AXM shall validate the proposed consumer values and report the planned configuration without changing settings, accepted resolutions, package content, native configuration, or verification receipts and without executing package code; invalid values shall be refused without mutation.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  boundary: "platform",
  boundaryRationale:
    "Byte snapshots and a script sentinel observe filesystem mutation and implicit package execution.",
  derivedFrom: ["cli/hooks/configure/preserves-acquisition-and-package-content"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Hook extension configuration preview", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  for (const valid of [true, false]) {
    it.effect(`${valid ? "valid" : "invalid"} values leave every file unchanged`, () => {
      const world = makeConfigurationFixture({
        settings: { owner: "@acme", agents: [], hooks: { audit: "workspace" } },
        files: {
          "hooks/audit/hook.json": JSON.stringify({
            owner: "@acme",
            type: "hook",
            name: "audit",
            version: "1.0.0",
            configuration: { label: { type: "string", required: true } },
            implementations: [
              {
                id: "claude",
                protocol: "claude-code",
                bindings: [
                  {
                    id: "audit",
                    event: "PreToolUse",
                    handler: {
                      type: "command",
                      runtime: "bash",
                      entrypoint: "src/hook.sh",
                      args: [{ config: "label" }],
                    },
                  },
                ],
              },
            ],
          }),
          "hooks/audit/src/hook.sh": "#!/usr/bin/env bash\ntouch executed-sentinel\n",
          ".claude/settings.json": "foreign bytes\n",
        },
      });
      cleanups.push(world.cleanup);
      return world
        .provide(
          Effect.gen(function* () {
            const before = world.snapshot();
            const candidate = yield* ConfigureHook.prepare({
              name: "audit",
              configuration: valid ? { label: "preview" } : { unknown: "invalid" },
            }).pipe(Effect.result);
            if (candidate._tag === "Success") {
              expect(valid).toBe(true);
              expect(
                deriveOperationOutcome(
                  yield* ConfigureHook.previewOrApply(candidate.success, previewPlanExecution),
                ),
              ).toBe("previewed");
            } else {
              expect(valid).toBe(false);
              expect(candidate.failure).toMatchObject({ _tag: "WorkspaceConfigurationFailed" });
            }
            expect(world.snapshot()).toEqual(before);
            expect(world.exists("executed-sentinel")).toBe(false);
            expect(world.exists("hooks/audit/executed-sentinel")).toBe(false);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    });
  }
});
