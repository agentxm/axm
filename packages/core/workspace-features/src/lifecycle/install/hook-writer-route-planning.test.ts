/**
 * How often Hook install planning resolves the configured Hook writer routes.
 *
 * Resolving the routes probes the native settings file, which is absent here,
 * twice; the preparation's plan observation and each prepared input's overlap
 * check probe it too. One planning call resolves the routes once in its
 * preparation and hands them to each selected Hook's outcome evaluation, so
 * these examples count the probes of `.claude/settings.json` that planning
 * alone makes, in real workspaces.
 */
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";

import { makeLifecycleFixture } from "../testing.js";
import { writeLocalHookPackage } from "../../testing/local-packages.js";
import { installRequest } from "../../testing/install-world.js";
import { InstallExtensions } from "../index.js";

// The recording filesystem replaces the platform one; the rest of the platform services stay.
const recordedNodeServices = Layer.provideMerge(
  layerRecordingFileSystem(NodeFileSystem.layer),
  NodeServices.layer,
);

const SETTINGS = ".claude/settings.json";

describe("Hook install planning resolves the writer routes once", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  // Measured when the preparation resolved the routes twice and each Hook's
  // outcome evaluation once more: 19 and 25; with only the preparation's own
  // repeat removed: 17 and 23; while each native settings run admitted every
  // spelling of the file and re-resolved it per declaration: 15 and 19.
  for (const { packages, probes } of [
    { packages: ["demo"], probes: 11 },
    { packages: ["first", "second"], probes: 13 },
  ]) {
    it.effect(
      `plans an install of ${packages.length} local Hook package(s)`,
      () =>
        Effect.gen(function* () {
          const workspace = makeLifecycleFixture({
            sources: "live",
            settings: { owner: "@acme", agents: ["claude-code"] },
          });
          cleanups.push(workspace.cleanup);
          const sourceRoot = nodePath.join(workspace.root, "source");
          for (const name of packages) writeLocalHookPackage(sourceRoot, { name });
          const source =
            packages.length === 1 ? nodePath.join(sourceRoot, "vendor", "demo") : sourceRoot;
          const counted = yield* Effect.gen(function* () {
            const recording = yield* FileSystemRecorder;
            recording.reset();
            const candidate = yield* InstallExtensions.prepare(
              installRequest({ type: "hook", subject: { kind: "source", source } }),
            );
            const steps = candidate.execution.plan.jobs.flatMap((job) => job.steps);
            return {
              readiness: [...new Set(steps.map((step) => step.readiness))],
              // Each Hook step's agents come from its configured-agent outcomes.
              hookAgents: steps.flatMap((step) =>
                step.artifact?.agents === undefined ? [] : [step.artifact.agents],
              ),
              probes: recording.calls({
                path: nodePath.join(workspace.root, SETTINGS),
                method: "readLink",
              }).length,
            };
          }).pipe(workspace.provide, Effect.provide(recordedNodeServices));
          expect(counted).toEqual({
            readiness: ["ready"],
            hookAgents: packages.map(() => ["claude-code"]),
            probes,
          });
        }),
      { timeout: 60_000 },
    );
  }
});
