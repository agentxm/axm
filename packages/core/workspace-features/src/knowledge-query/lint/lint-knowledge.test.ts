/**
 * Selecting installed Knowledge for lint reads the workspace documents once.
 *
 * The desired graph and the accepted Knowledge resolutions are two views of
 * the same lockfile; one document phase reads and decodes it once. An
 * authored package selected by path reads no workspace document and opens no
 * phase. Both selections report the same findings for the same content.
 */

import * as nodePath from "node:path";

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { NativePlatformTest, workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Tracer from "effect/Tracer";

import { lintKnowledge, type LintKnowledgeRequest } from "./lint-knowledge.js";
import { knowledgeDocument, makeKnowledgeFixtureWorkspace } from "../testing.js";

// The recorded filesystem replaces the native one; the other native services stay.
const recordedPlatform = Layer.provideMerge(
  layerRecordingFileSystem(NodeFileSystem.layer),
  NativePlatformTest,
);

const recordedLint = (request: LintKnowledgeRequest) => {
  const workspace = makeKnowledgeFixtureWorkspace({
    bundles: [
      {
        name: "platform",
        documents: {
          "guide.md": knowledgeDocument("# Guide\n"),
          "broken.md": "---\ntype: [broken\n---\n# Broken\n",
        },
      },
    ],
  });
  return workspace
    .provide(
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        // Layer construction reads the workspace root; only the lint is measured.
        recording.reset();
        const observations = workObservations(false);
        const spans: Array<Tracer.NativeSpan> = [];
        const tracer = Tracer.make({
          span(options) {
            const span = new Tracer.NativeSpan(options);
            spans.push(span);
            return span;
          },
        });
        const result = yield* lintKnowledge(request).pipe(
          observations.provide,
          Effect.withTracer(tracer),
        );
        const kinds = observations.facts.map((fact) => fact.kind);
        return {
          document: result.document,
          bundleCount: result.bundleCount,
          lockfileReads: recording.contentReads(nodePath.join(workspace.root, "axm.lock")),
          lockfileParses: kinds.filter((kind) => kind === "axm.parse.lockfile").length,
          phases: spans.filter((span) => span.name === "axm.observation.phase").length,
        };
      }),
    )
    .pipe(Effect.provide(recordedPlatform), Effect.ensuring(Effect.sync(workspace.cleanup)));
};

describe("Knowledge lint workspace document reads", () => {
  it.effect("reads and decodes the lockfile once to select installed bundles", () =>
    Effect.gen(function* () {
      const installed = yield* recordedLint({ bundle: "platform" });
      expect(installed.bundleCount).toBe(1);
      expect(installed.document.valid).toBe(false);
      expect({
        lockfileReads: installed.lockfileReads,
        lockfileParses: installed.lockfileParses,
        phases: installed.phases,
      }).toEqual({ lockfileReads: 1, lockfileParses: 1, phases: 1 });
    }),
  );

  it.effect("reads no workspace document for an authored package path", () =>
    Effect.gen(function* () {
      const authored = yield* recordedLint({ packagePath: "knowledge/platform" });
      expect(authored.bundleCount).toBe(1);
      expect({
        lockfileReads: authored.lockfileReads,
        lockfileParses: authored.lockfileParses,
        phases: authored.phases,
      }).toEqual({ lockfileReads: 0, lockfileParses: 0, phases: 0 });
    }),
  );

  it.effect("reports the same findings for installed and authored selection", () =>
    Effect.gen(function* () {
      const installed = yield* recordedLint({ bundle: "platform" });
      const authored = yield* recordedLint({ packagePath: "knowledge/platform" });
      expect(installed.document.diagnostics).toContainEqual(
        expect.objectContaining({ bundle: "platform", severity: "error" }),
      );
      expect(installed.document).toEqual(authored.document);
    }),
  );
});
