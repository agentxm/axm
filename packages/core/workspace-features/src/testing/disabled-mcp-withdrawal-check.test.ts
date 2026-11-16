/**
 * Check's convergence assessment of a disabled MCP connection that is still
 * active in an agent's native file. The assessment's content view serves
 * repeated bytes from one read and verifies each repeated read's identity;
 * the withdrawal preview plans from the disabled connection's inspection, so
 * the preview's own target resolution and first read, with their identity
 * probes, no longer run. These counts run the production check over a real
 * temporary workspace, beneath the production file system.
 */
import * as nodePath from "node:path";

import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { makeAxmSkillCompatibilityPolicyLayer } from "@agentxm/cli-maintenance/official-skill/composition";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { lintSelectedSubjects } from "../linting/index.js";
import { checkLocal } from "../inspection/index.js";
import { SyncWorkspace } from "../sync/index.js";
import { applySync, makeSyncFixture } from "./sync-fixture.js";

const owners = {
  lint: lintSelectedSubjects,
  convergence: SyncWorkspace.assessLocalMaterialization,
};

const connection = { transport: "stdio", command: "node", args: ["review.js"] } as const;

describe("Check convergence of a disabled MCP connection", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "assesses the withdrawal from the inspection's observation",
    () => {
      const workspace = makeSyncFixture({
        settings: {
          owner: "@acme",
          agents: ["claude-code"],
          mcpServers: { review: { connection, enabled: true } },
        },
      });
      cleanups.push(workspace.cleanup);
      return Effect.gen(function* () {
        yield* workspace.provide(applySync());
        workspace.writeSettings({
          ...workspace.readSettings(),
          mcpServers: { review: { connection, enabled: false } },
        });
        const recording = yield* FileSystemRecorder;
        recording.reset();
        const document = yield* workspace.provide(
          checkLocal(
            {
              selection: { kind: "identities", identities: ["review"] },
              checks: ["convergence"],
              strict: false,
              userHome: workspace.home,
            },
            owners,
          ),
        );
        const native = nodePath.join(workspace.root, ".mcp.json");
        expect({
          conclusion: document.assessments.find(({ kind }) => kind === "convergence")?.conclusion,
          reads: recording.contentReads(native),
          realPaths: recording.counts(native).realPath ?? 0,
          stats: recording.counts(native).stat ?? 0,
          // A configured-target resolution or a co-reader preflight captures this location.
          captures:
            recording.counts(nodePath.join(workspace.root, ".cursor/mcp.json")).realPath ?? 0,
        }).toEqual({
          conclusion: "attention-required",
          // The content view serves the native file's repeated bytes from one read.
          reads: 1,
          // The identity probes of the preview's own resolution and first read are gone
          // (44 realPaths, 36 stats and eight captures before).
          realPaths: 39,
          stats: 33,
          captures: 7,
        });
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            NodeServices.layer,
            layerRecordingFileSystem(NodeServices.layer),
            makeAxmSkillCompatibilityPolicyLayer("1.0.0"),
          ),
        ),
      );
    },
    { timeout: 60_000 },
  );
});
