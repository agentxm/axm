import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Tracer from "effect/Tracer";
import { NativePlatformTest, withDetailedWork } from "../../locations/testing.js";
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
  it.effect.each([
    { abandon: false, tracing: true },
    { abandon: true, tracing: true },
    { abandon: true, tracing: false },
  ])(
    "counts desired-state reuse and retried abandoned work (abandon=$abandon, tracing=$tracing)",
    ({ abandon, tracing }) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped();
        const entered = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        let observations = 0;
        const spans: Tracer.NativeSpan[] = [];
        const tracer = Tracer.make({
          span(options) {
            const span = new Tracer.NativeSpan(options);
            spans.push(span);
            return span;
          },
        });
        const layer = WorkspaceReadViewsLive.pipe(
          Layer.provideMerge(WorkspaceReadTest({ baseDir: root })),
          Layer.provide(
            Layer.succeed(
              WorkspaceDocuments,
              batchableWorkspaceDocuments({
                settings: () => Effect.succeed(createDefaultSettings()),
                acceptedResolutions: Effect.succeed({
                  lockfileVersion: LOCKFILE_VERSION,
                  skills: {},
                }),
                acceptedResolutionState: Effect.succeed("missing"),
                writeSettings: () => Effect.die("This query never writes settings"),
                commitAcceptedResolutions: () => Effect.die("This query never writes lock state"),
              }),
            ),
          ),
          Layer.provide(
            Layer.succeed(PackManifests, {
              locate: () => ({
                path: `${root}/packs/toolkit/pack.json`,
                relativePath: "packs/toolkit/pack.json",
                manifest: Effect.gen(function* () {
                  observations++;
                  yield* Deferred.succeed(entered, undefined);
                  yield* Deferred.await(release);
                  return { status: "absent" as const };
                }),
              }),
            }),
          ),
        );
        yield* withWorkspaceObservationReadView(
          Effect.gen(function* () {
            const desired = yield* DesiredStateReader;
            const settings = Schema.decodeUnknownSync(SettingsSchema)({
              owner: "@acme",
              packs: { toolkit: "workspace" },
            });
            const acceptedResolutions: Lockfile = { lockfileVersion: LOCKFILE_VERSION, skills: {} };
            const evaluate = desired.evaluate({ settings, acceptedResolutions });
            let first = yield* evaluate.pipe(Effect.forkChild({ startImmediately: true }));
            yield* Deferred.await(entered);
            const cancelled = yield* evaluate.pipe(Effect.forkChild({ startImmediately: true }));
            yield* Fiber.interrupt(cancelled);
            expect(Exit.hasInterrupts(yield* Fiber.await(cancelled))).toBe(true);
            if (abandon) {
              yield* Fiber.interrupt(first);
              expect(Exit.hasInterrupts(yield* Fiber.await(first))).toBe(true);
              first = yield* evaluate.pipe(Effect.forkChild({ startImmediately: true }));
            }
            const follower = yield* evaluate.pipe(Effect.forkChild({ startImmediately: true }));
            yield* Deferred.succeed(release, undefined);
            const original = yield* Fiber.join(first);
            expect(yield* Fiber.join(follower)).toBe(original);
            expect(yield* evaluate).toBe(original);
            expect(original.inputs.packDocuments[0]?.observation.status).toBe("absent");
          }),
        ).pipe(Effect.provide(layer), withDetailedWork(tracer), Effect.withTracerEnabled(tracing));
        expect(observations).toBe(abandon ? 2 : 1);
        if (!tracing) {
          expect(spans).toHaveLength(0);
          return;
        }
        const requests = spans.filter((span) => span.name === "axm.resolve.desired-state-reuse");
        expect(requests.map((span) => span.attributes.get("axm.cache.outcome"))).toEqual([
          "miss",
          "coalesced",
          ...(abandon ? ["miss"] : []),
          "coalesced",
          "hit",
        ]);
        expect(requests.map((span) => span.attributes.get("axm.work.executed"))).toEqual([
          1,
          0,
          ...(abandon ? [1] : []),
          0,
          0,
        ]);
        expect(requests.map((span) => span.attributes.get("axm.work.reused-count"))).toEqual([
          0,
          0,
          ...(abandon ? [0] : []),
          1,
          1,
        ]);
        expect(spans.filter((span) => span.name === "axm.resolve.desired-state")).toHaveLength(
          abandon ? 2 : 1,
        );
      }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect(
    "observes pending logical locks without claiming persistence and releases retained readers",
    () =>
      Effect.gen(function* () {
        const spans: Tracer.NativeSpan[] = [];
        const tracer = Tracer.make({
          span(options) {
            const span = new Tracer.NativeSpan(options);
            spans.push(span);
            return span;
          },
        });
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
                  return { locks, settings: settingsReader, desired };
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
          const afterPhase = yield* retained.desired.evaluate({
            settings: createDefaultSettings(),
            acceptedResolutions: empty,
          });
          expect(afterPhase.inputs.acceptedResolutions).toBe(empty);
        }).pipe(Effect.provide(layer), withDetailedWork(tracer));
        const requests = spans.filter((span) => span.name === "axm.resolve.desired-state-reuse");
        expect(requests.map((span) => span.attributes.get("axm.cache.outcome"))).toEqual([
          "miss",
          "hit",
          "miss",
          "bypass",
        ]);
        expect(requests.map((span) => span.attributes.get("axm.work.executed"))).toEqual([
          1, 0, 1, 1,
        ]);
        expect(spans.filter((span) => span.name === "axm.resolve.desired-state")).toHaveLength(3);
      }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );
});
