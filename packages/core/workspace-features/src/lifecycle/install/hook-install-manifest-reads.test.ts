/**
 * How often Hook install planning reads a selected Hook's manifest.
 *
 * A Hook installed from a local path or from the workspace is read from its
 * own directory. One planning call decodes that `hook.json` in its
 * preparation and evaluates the Hook's configured-agent outcomes from the
 * same decode, so these examples count the content reads of the manifest
 * that planning alone makes, in real workspaces.
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
import { planHookInstall } from "@agentxm/extension-kinds/hooks";
import type { HookExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import {
  WorkspaceLocation,
  computePackageContentHash,
  withWorkspaceReadView,
} from "@agentxm/workspace-kernel/workspace-state";

import { makeLifecycleFixture } from "../testing.js";
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
});
