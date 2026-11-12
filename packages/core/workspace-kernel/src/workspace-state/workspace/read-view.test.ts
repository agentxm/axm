import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import { NativePlatformTest } from "../../locations/testing.js";
import { createDefaultSettings, SettingsSchema } from "../desired/settings/index.js";
import { LOCKFILE_VERSION, type Lockfile } from "../desired/lockfile/index.js";
import { WorkspaceReadTest, handle, makeRegistrySkillLockEntry } from "../testing.js";
import {
  WorkspaceDocuments,
  batchableWorkspaceDocuments,
  withAcceptedResolutionBatch,
} from "./documents.js";
import { LockfileReader } from "./lockfile-reader.js";
import { SettingsReader } from "./settings-reader.js";
import { DesiredStateReader } from "./desired-state-reader.js";
import { PackManifests } from "./pack-manifests.js";
import { WorkspaceReadViewsLive, withWorkspaceObservationReadView } from "./read-view.js";

describe("workspace read phase lifetime", () => {
  it.effect(
    "observes pending logical locks without claiming persistence and releases retained readers",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        yield* fs.writeFileString(
          path.join(root, "axm.json"),
          JSON.stringify({
            owner: "@acme",
            packs: { toolkit: "workspace" },
          }),
        );
        const empty: Lockfile = { lockfileVersion: LOCKFILE_VERSION, skills: {} };
        const next: Lockfile = {
          ...empty,
          skills: {
            review: makeRegistrySkillLockEntry({ owner: handle("@acme"), name: "review" }),
          },
        };
        const stored = yield* Ref.make(empty);
        const storedSettings = yield* Ref.make(createDefaultSettings());
        let published = 0;
        const documents = batchableWorkspaceDocuments({
          settings: () => Ref.get(storedSettings),
          acceptedResolutions: Ref.get(stored),
          acceptedResolutionState: Effect.succeed("missing"),
          writeSettings: () => Effect.die("This read-only fixture never writes settings"),
          commitAcceptedResolutions: (_base, value) =>
            Ref.set(stored, value).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  published++;
                }),
              ),
            ),
        });
        const layer = WorkspaceReadViewsLive.pipe(
          Layer.provideMerge(WorkspaceReadTest({ baseDir: root })),
          Layer.provide(Layer.succeed(WorkspaceDocuments, documents)),
          Layer.provide(
            Layer.succeed(PackManifests, {
              locate: () => {
                throw new Error("A lock-only query must not evaluate Pack manifests");
              },
            }),
          ),
        );
        yield* Effect.gen(function* () {
          const retained = yield* withAcceptedResolutionBatch(
            Effect.gen(function* () {
              yield* documents.commitAcceptedResolutions(empty, next);
              expect(published).toBe(0);
              return yield* withWorkspaceObservationReadView(
                Effect.gen(function* () {
                  const locks = yield* LockfileReader;
                  const settingsReader = yield* SettingsReader;
                  expect(yield* settingsReader.configuredSources).toEqual([]);
                  expect(yield* locks.lockfile).toEqual(next);
                  expect(yield* locks.state).toBe("missing");
                  const desired = yield* DesiredStateReader;
                  const settings = createDefaultSettings();
                  // The view schema excludes persisted tool data. Structurally
                  // extended caller inputs must still not be JSON-serialized merely
                  // to identify the accepted-resolution value used by this graph.
                  const lossless = {
                    ...empty,
                    tool: {
                      sample: {
                        integer: 9007199254740993n,
                        instant: new Date("2026-01-01T00:00:00.000Z"),
                      },
                    },
                  };
                  const distinct = { ...empty, tool: { sample: { integer: "9007199254740993" } } };
                  const first = yield* desired.evaluate({
                    settings,
                    acceptedResolutions: lossless,
                  });
                  const reused = yield* desired.evaluate({
                    settings,
                    acceptedResolutions: lossless,
                  });
                  const second = yield* desired.evaluate({
                    settings,
                    acceptedResolutions: distinct,
                  });
                  expect(reused).toBe(first);
                  expect(first.inputs.acceptedResolutions).toBe(lossless);
                  expect(second.inputs.acceptedResolutions).toBe(distinct);
                  expect(second).not.toBe(first);
                  // A logical update inside a phase invalidates its pending snapshot
                  // even though no physical publication happens until batch exit.
                  yield* documents.commitAcceptedResolutions(next, empty);
                  expect(yield* locks.lockfile).toEqual(empty);
                  yield* documents.commitAcceptedResolutions(empty, next);
                  expect(yield* locks.lockfile).toEqual(next);
                  expect(published).toBe(0);
                  return { locks, settings: settingsReader };
                }),
              );
            }),
            documents,
          );
          expect(published).toBe(1);
          expect(yield* Ref.get(stored)).toEqual(next);
          // A deferred caller retained the reader port, not authority to reuse
          // the completed phase's pending snapshot after another publication.
          yield* Ref.set(stored, empty);
          expect(yield* retained.locks.lockfile).toEqual(empty);
          yield* Ref.set(
            storedSettings,
            Schema.decodeUnknownSync(SettingsSchema)({
              sources: [
                { name: "fresh", type: "registry", location: "https://registry.example.test" },
              ],
            }),
          );
          expect((yield* retained.settings.configuredSources).map((source) => source.name)).toEqual(
            ["fresh"],
          );
          expect((yield* retained.settings.sourceByName("fresh"))._tag).toBe("Some");
        }).pipe(Effect.provide(layer));
      }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );
});
