/**
 * Capturing the installed Knowledge corpus decodes each bundle's manifest from
 * the read its canonical observation made, and reads it itself only when that
 * observation handed back no decode.
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";

import { captureInstalledKnowledgeCorpus } from "./installed-corpus.js";
import { knowledgeDocument, makeKnowledgeFixtureWorkspace } from "../testing.js";

// The recorded filesystem replaces the native one; the other native services stay.
const recordedPlatform = Layer.provideMerge(
  layerRecordingFileSystem(NodeFileSystem.layer),
  NativePlatformTest,
);

const manifestPath = (workspace: ReturnType<typeof makeKnowledgeFixtureWorkspace>) =>
  nodePath.join(workspace.root, "knowledge", "platform", "knowledge.json");

const recordedCapture = (workspace: ReturnType<typeof makeKnowledgeFixtureWorkspace>) =>
  workspace
    .provide(
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        // Layer construction reads the workspace root; only the capture is measured.
        recording.reset();
        const exit = yield* Effect.exit(captureInstalledKnowledgeCorpus());
        return { exit, manifestReads: recording.contentReads(manifestPath(workspace)) };
      }),
    )
    .pipe(Effect.provide(recordedPlatform), Effect.ensuring(Effect.sync(workspace.cleanup)));

describe("Installed Knowledge corpus manifests", () => {
  it.effect("reads an installed bundle's manifest once per capture", () =>
    Effect.gen(function* () {
      const { exit, manifestReads } = yield* recordedCapture(
        makeKnowledgeFixtureWorkspace({
          bundles: [
            { name: "platform", documents: { "session.md": knowledgeDocument("# Session\n") } },
          ],
        }),
      );
      if (!Exit.isSuccess(exit)) throw new Error("Expected a captured corpus");
      if (exit.value.outcome !== "ready") throw new Error("Expected a ready corpus");
      expect(exit.value.bundles).toMatchObject([
        { name: "platform", bundle: "@acme/knowledge/platform", version: "1.0.0" },
      ]);
      // The capture read the manifest again after the observation: 2 reads.
      expect(manifestReads).toBe(1);
    }),
  );

  it.effect("reports a corrupt manifest exactly as reading it does", () =>
    Effect.gen(function* () {
      const workspace = makeKnowledgeFixtureWorkspace({
        bundles: [{ name: "platform", documents: {} }],
      });
      fs.writeFileSync(manifestPath(workspace), "{not json");
      const { exit, manifestReads } = yield* recordedCapture(workspace);
      expect(Exit.isFailure(exit)).toBe(true);
      if (!Exit.isFailure(exit)) return;
      expect(exit.cause.reasons).toMatchObject([
        {
          error: {
            _tag: "KnowledgeCorpusUnavailable",
            reason: "source-unreadable",
            detail: 'Failed to read knowledge bundle "platform" manifest',
            bundle: "platform",
            cause: { _tag: "ManifestError", code: "manifest_invalid_json" },
          },
        },
      ]);
      // The observation's decode failed, so the capture read the manifest itself.
      expect(manifestReads).toBe(2);
    }),
  );
});
