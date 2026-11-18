/**
 * How a version change reads the authored manifest.
 *
 * Settling the change observes the declared package once; that observation
 * already reads the manifest, so prepare decodes the version from the text it
 * read instead of reading the file again. The transaction still re-reads the
 * manifest fresh before writing and again to validate the write, and every
 * way the manifest can be unavailable keeps the refusal it has always had.
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";

import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import {
  LockfileIoError,
  LockfileReader,
  WorkspaceReadViews,
} from "@agentxm/workspace-kernel/workspace-state";
import { describe, expect, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import { afterEach } from "vitest";

import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
  previewExecution,
  type AuthoringWorkspace,
} from "../test-support/authoring-workspace.js";
import { authoringTypeFor, writeAuthoringPackage } from "../test-support/authoring-packages.js";
import { ChangeAuthoredVersion, type AuthoredVersionChange } from "./change-authored-version.js";

// The recorded filesystem replaces the native one for the measured program.
const recordedFileSystem = layerRecordingFileSystem(NativePlatformTest);

/**
 * Root and Windows ignore the permission bits the unsearchable and unreadable
 * controls rely on, so those controls run only for an unprivileged process.
 */
const privileged = process.platform === "win32" || process.getuid?.() === 0;

const minor: AuthoredVersionChange = { _tag: "Increment", rule: "minor" };
const fqn = "@acme/skills/review";
const manifestRelative = "skills/review/skill.json";

/**
 * The manifest calls settling a bump makes: the canonical observation's read
 * and the execution candidate's material fingerprint (its link and status
 * probes are not counted here).
 */
const prepareManifestCalls = ["readFile", "readFile"];

/**
 * The manifest calls applying a bump makes: the candidate's freshness
 * fingerprint, the transition's fresh re-read before writing, and the
 * validation's fresh re-read after it.
 */
const applyManifestCalls = ["readFile", "readFile", "readFile"];

/**
 * Independent observations (candidate fingerprints, freshness checks) use the
 * read views' live port; record it too, so every manifest call is counted.
 */
const recordLiveObservations = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const views = yield* WorkspaceReadViews;
    const recorded = yield* FileSystem.FileSystem;
    return yield* effect.pipe(
      Effect.provideService(WorkspaceReadViews, {
        ...views,
        liveObservations: Context.add(views.liveObservations, FileSystem.FileSystem, recorded),
      }),
    );
  });

/** The declared package cannot be observed: its accepted resolution does not read. */
const unobservable = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const views = yield* WorkspaceReadViews;
    return yield* effect.pipe(
      Effect.provideService(WorkspaceReadViews, {
        ...views,
        capture: (options) =>
          views.capture(options).pipe(
            Effect.map((context) =>
              Context.add(context, LockfileReader, {
                ...Context.get(context, LockfileReader),
                acceptedEntry: (_type, _name) =>
                  Effect.fail(new LockfileIoError({ path: "axm.lock", cause: "unreadable" })),
              }),
            ),
          ),
      }),
    );
  });

describe("Changing an authored version", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /** A project workspace authoring the `review` skill at 1.2.3. */
  const authoredWorkspace = () => {
    const created = makeAuthoringWorkspace({ owner: "@acme", agents: [] });
    cleanups.push(created.cleanup);
    created.writeSettings({
      owner: "@acme",
      agents: [],
      skills: { review: { source: "workspace" } },
    });
    writeAuthoringPackage(created.root, authoringTypeFor("skill"), "review", { parent: "skills" });
    return created;
  };

  const manifestCalls = (calls: ReadonlyArray<{ readonly method: string }>) =>
    calls
      .map((call) => call.method)
      .filter((method) => method === "access" || method === "readFile");

  /** Prepare and resolve one change, recording manifest calls of each phase. */
  const recordedChange = (
    created: AuthoringWorkspace,
    execution = applyExecution,
    change: AuthoredVersionChange = minor,
  ) =>
    Effect.gen(function* () {
      const recording = yield* FileSystemRecorder;
      const manifestPath = nodePath.join(created.root, manifestRelative);
      recording.reset();
      const candidate = yield* ChangeAuthoredVersion.prepare({ fqn, change });
      const prepare = manifestCalls(recording.calls({ path: manifestPath }));
      recording.reset();
      const resolution = yield* ChangeAuthoredVersion.previewOrApply(candidate, execution);
      const apply = manifestCalls(recording.calls({ path: manifestPath }));
      return { candidate, resolution, prepare, apply };
    }).pipe(
      recordLiveObservations,
      // The recorded filesystem is merged last, so it is the one the measured
      // program sees.
      Effect.provide(Layer.merge(authoringWorkspaceLayer(created), recordedFileSystem)),
    );

  const prepareFailure = (
    created: AuthoringWorkspace,
    around: <A, E, R>(
      effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E, R | WorkspaceReadViews> = (effect) => effect,
  ) =>
    ChangeAuthoredVersion.prepare({ fqn, change: minor }).pipe(
      Effect.flip,
      around,
      Effect.provide(authoringWorkspaceLayer(created)),
    );

  it.effect("prepare decodes the version from the text the observation read", () =>
    Effect.gen(function* () {
      const created = authoredWorkspace();

      const { candidate, resolution, prepare, apply } = yield* recordedChange(created);

      expect({ from: candidate.from, to: candidate.to }).toEqual({ from: "1.2.3", to: "1.3.0" });
      expect(deriveOperationOutcome(resolution)).toBe("applied");
      expect({ prepare, apply }).toEqual({
        prepare: prepareManifestCalls,
        apply: applyManifestCalls,
      });
    }),
  );

  it.effect("a preview reads the manifest only while settling", () =>
    Effect.gen(function* () {
      const created = authoredWorkspace();
      const before = created.snapshot();

      const { resolution, prepare, apply } = yield* recordedChange(created, previewExecution);

      expect(deriveOperationOutcome(resolution)).toBe("previewed");
      expect(prepare).toEqual(prepareManifestCalls);
      expect(apply).toEqual([]);
      expect(created.snapshot()).toEqual(before);
    }),
  );

  it.effect("a bump preserves every other manifest byte", () =>
    Effect.gen(function* () {
      const created = authoredWorkspace();
      const manifest = `{\n  "owner": "@acme",\n  "type": "skill",\n  "name": "review",\n  "version": "1.2.3",\n  "x-foreign": {"keep": [1, 2]}\n}`;
      created.write(manifestRelative, manifest);

      yield* recordedChange(created);

      expect(created.read(manifestRelative)).toBe(
        `${JSON.stringify({ ...JSON.parse(manifest), version: "1.3.0" }, null, 2)}`,
      );
    }),
  );

  it.effect("a manifest that moved after prepare refuses the bump", () =>
    Effect.gen(function* () {
      const created = authoredWorkspace();
      const resolution = yield* Effect.gen(function* () {
        const candidate = yield* ChangeAuthoredVersion.prepare({ fqn, change: minor });
        const current = created.read(manifestRelative) ?? "";
        created.write(manifestRelative, current.replace('"1.2.3"', '"2.0.0"'));
        return yield* ChangeAuthoredVersion.previewOrApply(candidate, applyExecution);
      }).pipe(Effect.provide(authoringWorkspaceLayer(created)));

      expect(deriveOperationOutcome(resolution)).toBe("blocked");
      expect(resolution.blocking).toMatchObject({ class: "stale-candidate", phase: "validation" });
      expect(JSON.parse(created.read(manifestRelative) ?? "null")).toMatchObject({
        version: "2.0.0",
      });
    }),
  );

  describe("an unavailable manifest keeps its refusal", () => {
    it.effect("a missing manifest is missing, with the command that creates it", () =>
      Effect.gen(function* () {
        const created = authoredWorkspace();
        fs.rmSync(nodePath.join(created.root, manifestRelative));

        const failure = yield* prepareFailure(created);

        expect(failure).toMatchObject({
          _tag: "AuthoredManifestUnavailable",
          manifestPath: manifestRelative,
          reason: "missing",
          createCommand: "axm skills new",
        });
      }),
    );

    it.effect.skipIf(privileged)("a manifest under an unsearchable directory is missing", () =>
      Effect.gen(function* () {
        const created = authoredWorkspace();
        const directory = nodePath.join(created.root, "skills", "review");
        fs.chmodSync(directory, 0o600);
        cleanups.unshift(() => fs.chmodSync(directory, 0o755));

        const failure = yield* prepareFailure(created);

        expect(failure).toMatchObject({
          _tag: "AuthoredManifestUnavailable",
          reason: "missing",
          createCommand: "axm skills new",
        });
      }),
    );

    it.effect.skipIf(privileged)("a manifest that cannot be read is unreadable", () =>
      Effect.gen(function* () {
        const created = authoredWorkspace();
        const manifest = nodePath.join(created.root, manifestRelative);
        fs.chmodSync(manifest, 0o000);
        cleanups.unshift(() => fs.chmodSync(manifest, 0o644));

        const failure = yield* prepareFailure(created);

        expect(failure).toMatchObject({
          _tag: "AuthoredManifestUnavailable",
          manifestPath: manifestRelative,
          reason: "unreadable",
        });
        expect(failure).not.toHaveProperty("createCommand");
        expect(failure).toHaveProperty("cause");
      }),
    );

    it.effect("a directory at the manifest path is unreadable", () =>
      Effect.gen(function* () {
        const created = authoredWorkspace();
        const manifest = nodePath.join(created.root, manifestRelative);
        fs.rmSync(manifest);
        fs.mkdirSync(manifest);

        const failure = yield* prepareFailure(created);

        expect(failure).toMatchObject({
          _tag: "AuthoredManifestUnavailable",
          manifestPath: manifestRelative,
          reason: "unreadable",
        });
      }),
    );

    it.effect("a manifest that is not JSON is unparsable", () =>
      Effect.gen(function* () {
        const created = authoredWorkspace();
        created.write(manifestRelative, "{ not json");

        const failure = yield* prepareFailure(created);

        expect(failure).toMatchObject({
          _tag: "AuthoredManifestUnavailable",
          manifestPath: manifestRelative,
          reason: "unparsable",
        });
      }),
    );

    it.effect("a manifest that is not an object is invalid", () =>
      Effect.gen(function* () {
        const created = authoredWorkspace();
        created.write(manifestRelative, "[]\n");

        const failure = yield* prepareFailure(created);

        expect(failure).toMatchObject({
          _tag: "AuthoredManifestUnavailable",
          manifestPath: manifestRelative,
          reason: "invalid",
        });
      }),
    );

    it.effect("a broken manifest wins over a package that cannot be observed", () =>
      Effect.gen(function* () {
        const created = authoredWorkspace();
        created.write(manifestRelative, "{ not json");

        const failure = yield* prepareFailure(created, unobservable);

        expect(failure).toMatchObject({
          _tag: "AuthoredManifestUnavailable",
          reason: "unparsable",
        });
      }),
    );

    it.effect("a readable manifest of a package that cannot be observed is an invalid target", () =>
      Effect.gen(function* () {
        const created = authoredWorkspace();

        const failure = yield* prepareFailure(created, unobservable);

        expect(failure).toEqual(
          expect.objectContaining({
            _tag: "VersionTargetInvalid",
            detail: `Unable to observe the authored package for ${fqn}`,
          }),
        );
      }),
    );
  });
});
