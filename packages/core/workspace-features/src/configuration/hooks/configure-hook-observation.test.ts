/**
 * Hook configuration observes the hook unit once per owner call: preparation
 * consumes the manager's eager observation, and the transition validates every
 * target once before its first write and then applies under the lock.
 *
 * Counts are exact for this fixture. Each observation or locked apply of the
 * hook unit reads `.claude/settings.json` once.
 */
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { applyPlanExecution, deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";

import { ConfigureHook } from "../index.js";
import { makeConfigurationFixture } from "../testing.js";

// The recording filesystem replaces the platform one; the rest of the platform services stay.
const recordedNodeServices = Layer.provideMerge(
  layerRecordingFileSystem(NodeFileSystem.layer),
  NodeServices.layer,
);

const SETTINGS = ".claude/settings.json";

const hookManifest = JSON.stringify({
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
});

const foreignRegistration = `${JSON.stringify(
  {
    hooks: {
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo foreign" }] }],
    },
  },
  null,
  2,
)}\n`;

const acceptingExecutionChanges = applyPlanExecution({
  approval: "preapproved",
  acceptedPolicies: new Set(["accept-execution-changes"]),
  recovery: { command: ["hooks", "configure"], arguments: [] },
});

describe("Hook configuration hands the eager hook observation to its consumer", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "observes the hook unit once in preparation and once before the locked apply",
    () => {
      const world = makeConfigurationFixture({
        settings: { owner: "@acme", agents: ["claude-code"], hooks: { audit: "workspace" } },
        files: {
          "hooks/audit/hook.json": hookManifest,
          "hooks/audit/src/hook.sh": "#!/usr/bin/env bash\necho audit\n",
          [SETTINGS]: foreignRegistration,
        },
      });
      cleanups.push(world.cleanup);
      const settingsPath = nodePath.join(world.root, SETTINGS);
      return world
        .provide(
          Effect.gen(function* () {
            const recording = yield* FileSystemRecorder;
            recording.reset();
            const prepareWork = workObservations(false);
            const candidate = yield* ConfigureHook.prepare({
              name: "audit",
              configuration: { label: "counted" },
            }).pipe(prepareWork.provide);
            const prepared = {
              settingsReads: recording.contentReads(settingsPath),
              nativeParses: prepareWork.facts.filter((fact) => fact.kind === "axm.parse.native")
                .length,
            };

            recording.reset();
            const applyWork = workObservations(false);
            const resolution = yield* ConfigureHook.previewOrApply(
              candidate,
              acceptingExecutionChanges,
            ).pipe(applyWork.provide);
            const applied = {
              settingsReads: recording.contentReads(settingsPath),
              nativeParses: applyWork.facts.filter((fact) => fact.kind === "axm.parse.native")
                .length,
            };

            expect(deriveOperationOutcome(resolution)).toBe("applied");
            expect(world.readFile(SETTINGS)).toContain("counted");
            expect(world.readFile(SETTINGS)).toContain("echo foreign");
            // Observing the plans again read 3 times and parsed 8 times in
            // preparation, and read 7 times and parsed 12 times in the apply.
            expect({ prepared, applied }).toEqual({
              prepared: { settingsReads: 2, nativeParses: 4 },
              applied: { settingsReads: 6, nativeParses: 8 },
            });
          }),
        )
        .pipe(Effect.provide(recordedNodeServices));
    },
    { timeout: 30_000 },
  );
});
