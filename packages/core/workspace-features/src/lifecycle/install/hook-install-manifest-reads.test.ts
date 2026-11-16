/**
 * How often Hook install planning reads a selected Hook's manifest.
 *
 * A Hook installed from a local path or from the workspace is read from its
 * own directory. One planning call decodes that `hook.json` in its
 * preparation and evaluates the Hook's configured-agent outcomes from the
 * same decode, so these examples count the content reads of the manifest
 * that planning alone makes, in real workspaces. Applying the install still
 * evaluates the applied outcomes from the manifest read after the write.
 */
import { pathToFileURL } from "node:url";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { readExtensionManifest } from "@agentxm/extension-content";
import { applyPlanExecution, deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { planHookInstall } from "@agentxm/extension-kinds/hooks";
import type { HookExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import {
  WorkspaceLocation,
  computePackageContentHash,
  withWorkspaceReadView,
} from "@agentxm/workspace-kernel/workspace-state";

import { InstallExtensions } from "./install-extensions.js";
import { makeLifecycleFixture } from "../testing.js";
import { installRequest } from "../../testing/install-world.js";
import { writeLocalHookPackage } from "../../testing/local-packages.js";

// The recording filesystem replaces the platform one; the rest of the platform services stay.
const recordedNodeServices = Layer.provideMerge(
  layerRecordingFileSystem(NodeFileSystem.layer),
  NodeServices.layer,
);

/** The ref an install selects for the package at `packageRoot`, from its own manifest. */
const hookRef = (refType: "local" | "workspace", packageRoot: string) =>
  Effect.gen(function* () {
    const { manifest } = yield* readExtensionManifest(packageRoot, "hook");
    const identity = { type: "hook" as const, owner: manifest.owner, name: manifest.name };
    const hook = { name: manifest.name };
    if (refType === "local")
      return {
        ...identity,
        refType,
        source: { type: "local", path: packageRoot },
        location: pathToFileURL(packageRoot).href,
        hook,
      } satisfies HookExtensionRef;
    return {
      ...identity,
      refType,
      source: {
        type: "workspace",
        owner: manifest.owner,
        extensionType: "hook",
        name: manifest.name,
      },
      version: manifest.version,
      scope: (yield* WorkspaceLocation).scope,
      location: packageRoot,
      sourceHash: yield* computePackageContentHash(packageRoot),
      hook,
    } satisfies HookExtensionRef;
  });

describe("Hook install planning reads a selected Hook's manifest once", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  for (const refType of ["local", "workspace"] as const)
    it.effect(
      `plans an install of a ${refType} Hook from one decode of its manifest`,
      () =>
        Effect.gen(function* () {
          const workspace = makeLifecycleFixture({
            sources: "live",
            settings: { owner: "@acme", agents: ["claude-code"] },
          });
          cleanups.push(workspace.cleanup);
          const packageRoot = writeLocalHookPackage(nodePath.join(workspace.root, "source"), {
            name: "demo",
          });
          const counted = yield* withWorkspaceReadView(
            Effect.gen(function* () {
              const ref = yield* hookRef(refType, packageRoot);
              const recording = yield* FileSystemRecorder;
              recording.reset();
              const plan = yield* planHookInstall({ refs: [{ ref, versionRange: Option.none() }] });
              const steps = plan.jobs.flatMap((job) => job.steps);
              return {
                readiness: steps.map((step) => step.readiness),
                agents: steps.map((step) => step.artifact?.agents),
                outcomes: steps.map((step) =>
                  step.artifact?.agentOutcomes?.map(({ agentId, outcome }) => ({
                    agentId,
                    outcome,
                  })),
                ),
                manifestReads: recording.contentReads(nodePath.join(packageRoot, "hook.json")),
              };
            }),
          ).pipe(workspace.provide, Effect.provide(recordedNodeServices));
          // The preparation decodes the manifest and its package walk reads
          // it once more. Measured before the outcome evaluation took the
          // preparation's decode: 3.
          expect(counted).toEqual({
            readiness: ["ready"],
            agents: [["claude-code"]],
            outcomes: [[{ agentId: "claude-code", outcome: "projected" }]],
            manifestReads: 2,
          });
        }),
      { timeout: 60_000 },
    );

  it.effect(
    "evaluates an applied local Hook's outcomes from the manifest as it is after the write",
    () =>
      Effect.gen(function* () {
        const workspace = makeLifecycleFixture({
          sources: "live",
          settings: { owner: "@acme", agents: ["claude-code"] },
        });
        cleanups.push(workspace.cleanup);
        const packageRoot = writeLocalHookPackage(nodePath.join(workspace.root, "source"), {
          name: "demo",
        });
        const counted = yield* Effect.gen(function* () {
          const candidate = yield* InstallExtensions.prepare(
            installRequest({ type: "hook", subject: { kind: "source", source: packageRoot } }),
          );
          const recording = yield* FileSystemRecorder;
          recording.reset();
          const { resolution } = yield* InstallExtensions.previewOrApply(
            candidate,
            applyPlanExecution({
              approval: "preapproved",
              acceptedPolicies: new Set(["accept-execution-changes"]),
              recovery: { command: ["install"], arguments: [] },
            }),
          );
          return {
            outcome: deriveOperationOutcome(resolution),
            outcomes: resolution.units.map((unit) =>
              unit.artifact?.agentOutcomes?.map(({ agentId, outcome }) => ({ agentId, outcome })),
            ),
            manifestReads: recording.contentReads(nodePath.join(packageRoot, "hook.json")),
          };
        }).pipe(workspace.provide, Effect.provide(recordedNodeServices));
        // The applied outcome evaluation reads the manifest itself, after the
        // write, rather than taking the planning decode: evaluated from that
        // decode, execution would read it 3 times.
        expect(counted).toEqual({
          outcome: "applied",
          outcomes: [[{ agentId: "claude-code", outcome: "current" }]],
          manifestReads: 4,
        });
      }),
    { timeout: 60_000 },
  );
});
