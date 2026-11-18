/**
 * Selecting the installed Knowledge corpus reads the workspace documents once.
 *
 * The desired graph and the accepted Knowledge resolutions are two views of
 * the same lockfile; one capture reads and decodes it once, while the bundle
 * content capture (with its stable double read) stays outside that phase.
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { NativePlatformTest, workObservations } from "@agentxm/workspace-kernel/locations/testing";
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

const recordedCapture = (
  workspace: ReturnType<typeof makeKnowledgeFixtureWorkspace>,
  options?: { readonly bundle?: string },
) => {
  const observations = workObservations(false);
  return workspace
    .provide(
      Effect.gen(function* () {
        const recording = yield* FileSystemRecorder;
        // Layer construction reads the workspace root; only the capture is measured.
        recording.reset();
        const exit = yield* Effect.exit(
          captureInstalledKnowledgeCorpus(options).pipe(observations.provide),
        );
        const kinds = observations.facts.map((fact) => fact.kind);
        return {
          exit,
          lockfileParses: kinds.filter((kind) => kind === "axm.parse.lockfile").length,
          settingsParses: kinds.filter((kind) => kind === "axm.parse.settings").length,
          lockfileReads: recording.contentReads(nodePath.join(workspace.root, "axm.lock")),
          manifestReads: recording.contentReads(
            nodePath.join(workspace.root, "knowledge", "platform", "knowledge.json"),
          ),
        };
      }),
    )
    .pipe(Effect.provide(recordedPlatform), Effect.ensuring(Effect.sync(workspace.cleanup)));
};

describe("Installed Knowledge corpus selection", () => {
  it.effect("reads and decodes the lockfile once per capture", () =>
    Effect.gen(function* () {
      const counts = yield* recordedCapture(
        makeKnowledgeFixtureWorkspace({
          bundles: [
            { name: "platform", documents: { "session.md": knowledgeDocument("# Session\n") } },
          ],
        }),
      );
      if (!Exit.isSuccess(counts.exit)) throw new Error("Expected a captured corpus");
      const captured = counts.exit.value;
      if (captured.outcome !== "ready") throw new Error("Expected a ready corpus");
      expect(captured.bundles.map((bundle) => bundle.bundle)).toEqual(["@acme/knowledge/platform"]);
      expect(counts.lockfileParses).toBe(1);
      expect(counts.lockfileReads).toBe(1);
      expect(counts.settingsParses).toBe(1);
      // The capture decodes the manifest its canonical observation read.
      expect(counts.manifestReads).toBe(1);
    }),
  );

  it.effect("reads the workspace documents again for a later capture", () => {
    const workspace = makeKnowledgeFixtureWorkspace({
      bundles: [
        { name: "platform", documents: {} },
        { name: "guides", documents: {} },
      ],
    });
    const observations = workObservations(false);
    const capturedNames = captureInstalledKnowledgeCorpus().pipe(
      Effect.map((captured) =>
        captured.outcome === "ready" ? captured.bundles.map((bundle) => bundle.name) : [],
      ),
      observations.provide,
    );
    return workspace
      .provide(
        Effect.gen(function* () {
          const recording = yield* FileSystemRecorder;
          recording.reset();
          const first = yield* capturedNames;
          // Disabling a bundle between captures must reach the next selection.
          const settingsPath = nodePath.join(workspace.root, "axm.json");
          fs.writeFileSync(
            settingsPath,
            workspace.readSettings().replace(/("guides": \{[^}]*"enabled": )true/, "$1false"),
          );
          const second = yield* capturedNames;
          const kinds = observations.facts.map((fact) => fact.kind);
          expect([...first].sort()).toEqual(["guides", "platform"]);
          expect(second).toEqual(["platform"]);
          // One read and decode per capture: the first phase is not reused.
          expect(kinds.filter((kind) => kind === "axm.parse.lockfile")).toHaveLength(2);
          expect(recording.contentReads(nodePath.join(workspace.root, "axm.lock"))).toBe(2);
          expect(kinds.filter((kind) => kind === "axm.parse.settings")).toHaveLength(2);
        }),
      )
      .pipe(Effect.provide(recordedPlatform), Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  it.effect("does not select a disabled bundle", () =>
    Effect.gen(function* () {
      const { exit } = yield* recordedCapture(
        makeKnowledgeFixtureWorkspace({
          bundles: [
            { name: "platform", documents: {} },
            { name: "disabled", enabled: false, documents: {} },
          ],
        }),
      );
      if (!Exit.isSuccess(exit)) throw new Error("Expected a captured corpus");
      if (exit.value.outcome !== "ready") throw new Error("Expected a ready corpus");
      expect(exit.value.bundles.map((bundle) => bundle.name)).toEqual(["platform"]);
    }),
  );

  it.effect("refuses a named bundle that is not installed", () =>
    Effect.gen(function* () {
      const { exit } = yield* recordedCapture(
        makeKnowledgeFixtureWorkspace({ bundles: [{ name: "platform", documents: {} }] }),
        { bundle: "absent" },
      );
      expect(Exit.isFailure(exit)).toBe(true);
      if (!Exit.isFailure(exit)) return;
      expect(exit.cause.reasons).toMatchObject([
        {
          error: {
            _tag: "KnowledgeCorpusUnavailable",
            reason: "bundle-not-installed",
            detail: 'Knowledge bundle "absent" is not installed',
            bundle: "absent",
          },
        },
      ]);
    }),
  );

  it.effect("reports an unreadable lockfile as a lockfile parse failure", () =>
    Effect.gen(function* () {
      const workspace = makeKnowledgeFixtureWorkspace({
        bundles: [{ name: "platform", documents: {} }],
      });
      fs.writeFileSync(nodePath.join(workspace.root, "axm.lock"), "version = [\n");
      const { exit } = yield* recordedCapture(workspace);
      expect(Exit.isFailure(exit)).toBe(true);
      if (!Exit.isFailure(exit)) return;
      expect(exit.cause.reasons).toMatchObject([
        {
          error: {
            _tag: "LockfileParseError",
            path: nodePath.join(workspace.root, "axm.lock"),
            raw: "version = [\n",
            cause: { lineNumber: 2, column: 0 },
          },
        },
      ]);
    }),
  );

  it.effect("reports a lockfile that cannot be read as a file", () =>
    Effect.gen(function* () {
      const workspace = makeKnowledgeFixtureWorkspace({
        bundles: [{ name: "platform", documents: {} }],
      });
      const lockfile = nodePath.join(workspace.root, "axm.lock");
      fs.rmSync(lockfile);
      fs.mkdirSync(lockfile);
      const { exit } = yield* recordedCapture(workspace);
      expect(Exit.isFailure(exit)).toBe(true);
      if (!Exit.isFailure(exit)) return;
      expect(exit.cause.reasons).toMatchObject([
        {
          error: {
            _tag: "LockfileIoError",
            path: lockfile,
            cause: { _tag: "PlatformError", reason: { _tag: "BadResource", method: "readFile" } },
          },
        },
      ]);
    }),
  );
});
