/**
 * Listing coding agents reads the workspace settings and lockfile once: one
 * read phase spans the report, so the instruction-health observation reuses
 * the documents the membership query read.
 *
 * Counts are exact for this fixture and are taken after fixture setup.
 */
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";

import { applyInstructionsRequest } from "../instructions/test-helpers.js";
import { makeConfigurationFixture } from "../testing.js";
import { listConfiguredAgents } from "./configure-agents.js";

// The recording filesystem replaces the platform one; the rest of the platform services stay.
const recordedNodeServices = Layer.provideMerge(
  layerRecordingFileSystem(NodeFileSystem.layer),
  NodeServices.layer,
);

describe("Listing coding agents reads the workspace documents once", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const fixture = () => {
    const world = makeConfigurationFixture({
      settings: { agents: ["claude-code"] },
      files: { "AGENTS.md": "# Authored instructions\n" },
    });
    cleanups.push(world.cleanup);
    return world;
  };

  it.effect(
    "reports instruction health from one settings read",
    () => {
      const world = fixture();
      return world
        .provide(
          Effect.gen(function* () {
            yield* applyInstructionsRequest({
              action: "enable",
              fileName: "AGENTS.md",
              gitignoreAliases: false,
            });
            const recording = yield* FileSystemRecorder;
            recording.reset();
            const observations = workObservations(false);
            const inventory = yield* listConfiguredAgents().pipe(observations.provide);
            const kinds = observations.facts.map((fact) => fact.kind);
            expect(inventory.items.find((item) => item.id === "claude-code")?.instructions).toBe(
              "ok",
            );
            // Before one phase spanned the report: 2 settings parses and reads.
            expect({
              settingsParses: kinds.filter((kind) => kind === "axm.parse.settings").length,
              lockfileParses: kinds.filter((kind) => kind === "axm.parse.lockfile").length,
              settingsReads: recording.contentReads(nodePath.join(world.root, "axm.json")),
              lockfileReads: recording.contentReads(nodePath.join(world.root, "axm.lock")),
            }).toEqual({
              settingsParses: 1,
              lockfileParses: 1,
              settingsReads: 1,
              lockfileReads: 1,
            });
          }),
        )
        .pipe(Effect.provide(recordedNodeServices));
    },
    { timeout: 30_000 },
  );

  it.effect(
    "fails on an unreadable lockfile or settings document with the parse failure",
    () => {
      const world = fixture();
      return world
        .provide(
          Effect.gen(function* () {
            yield* applyInstructionsRequest({
              action: "enable",
              fileName: "AGENTS.md",
              gitignoreAliases: false,
            });
            const settings = world.readFile("axm.json");
            world.writeFile("axm.lock", "this is = not [ a lockfile\n");
            const lockfile = yield* Effect.flip(listConfiguredAgents());
            world.writeFile("axm.json", "{ not json\n");
            const settingsDocument = yield* Effect.flip(listConfiguredAgents());
            world.writeFile("axm.json", settings);
            expect(lockfile).toMatchObject({
              _tag: "LockfileParseError",
              message: "",
              path: nodePath.join(world.workspaceRoot, "axm.lock"),
              raw: "this is = not [ a lockfile\n",
            });
            expect(settingsDocument).toMatchObject({
              _tag: "SettingsParseError",
              path: nodePath.join(world.workspaceRoot, "axm.json"),
              raw: "[Settings input withheld]",
            });
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
    { timeout: 30_000 },
  );
});
