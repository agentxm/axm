/**
 * Work a Pack's member inspection does for each workspace-authored member.
 *
 * The member's canonical observation reads and decodes its manifest; the
 * usable ref it reports is resolved from that same decode, while the
 * resolution's presence probe and package hash still run. The members are
 * inspected directly, outside an inspection read view, so every request is a
 * physical read. Counts are exact for this fixture over a real temporary
 * workspace.
 */
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { describe, expect, it } from "@effect/vitest";

import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { NativePlatformTest, workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { DesiredStateReader } from "@agentxm/workspace-kernel/workspace-state";

import { makeInspectionFixture } from "../testing.js";
import { inspectPackMembers } from "./pack-members.js";

const recordingPlatform = Layer.provideMerge(
  layerRecordingFileSystem(NodeFileSystem.layer),
  NativePlatformTest,
);

describe("Pack member inspection reads", () => {
  it.effect("reads a workspace-authored member's manifest once for its observation and ref", () => {
    const fixture = makeInspectionFixture({
      settings: {
        agents: [],
        owner: "@acme",
        packs: { toolkit: { source: "workspace", enabled: true } },
        rules: { review: { source: "workspace", enabled: true } },
      },
      files: {
        "packs/toolkit/pack.json": JSON.stringify({
          owner: "@acme",
          type: "pack",
          name: "toolkit",
          version: "0.0.1",
          dependencies: { "@acme/rules/review": ">=1.0.0" },
        }),
        "rules/review/rule.json": JSON.stringify({
          owner: "@acme",
          type: "rule",
          name: "review",
          version: "1.5.0",
          description: "Review guidance",
        }),
        "rules/review/src/RULE.md": "Review every change.\n",
      },
    });
    const packageDir = nodePath.join(fixture.root, "rules", "review");
    const manifestPath = nodePath.join(packageDir, "rule.json");
    return fixture
      .provide(
        Effect.gen(function* () {
          const graph = yield* (yield* DesiredStateReader).graph();
          const recording = yield* FileSystemRecorder;
          const work = workObservations(false);
          recording.reset();
          const members = yield* inspectPackMembers({
            root: nodePath.join(fixture.root, "packs", "toolkit"),
            packFqn: "@acme/packs/toolkit",
            graph,
          }).pipe(work.provide);

          expect(members).toEqual([
            expect.objectContaining({
              fqn: "@acme/rules/review",
              resolution: { status: "authored" },
              version: "1.5.0",
              reachability: "satisfying",
            }),
          ]);
          // The observation's read and the package hash's walk; resolving the
          // usable ref decodes nothing again.
          expect(recording.contentReads(manifestPath)).toBe(2);
          // The observation's and the resolution's presence probes.
          expect(recording.counts(packageDir).access).toBe(2);
          expect(work.facts.filter((fact) => fact.kind === "axm.hash.package")).toHaveLength(1);
        }),
      )
      .pipe(Effect.provide(recordingPlatform), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
});
