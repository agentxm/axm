import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { observationViewLayer, type NativeObservationView } from "../../locations/index.js";
import * as Option from "effect/Option";
import * as Context from "effect/Context";
import { defineSpecification } from "@agentxm/specification-metadata";
import { CurrentWorkspaceReadPhase, type WorkspaceReadPhaseState } from "./read-phase.js";
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
import { readSettingsCell, readLockfileCell, readModelFor } from "./state-cells.js";
import { WorkspaceLocation, type WorkspaceLocationService } from "./location.js";
import { PackManifests } from "./pack-manifests.js";
import {
  WorkspaceReadViews,
  WorkspaceReadViewsLive,
  withWorkspaceReadView,
  withWorkspaceObservationReadView,
  withFreshWorkspaceObservationReadView,
} from "./read-view.js";

export const specification = defineSpecification({
  requirement: "workspace/workspace-state/read-phases-have-bounded-lifetimes",
  title: "Read reuse is bounded by the owning workspace phase",
  statement:
    "Equivalent stable reads shall share document decoding and candidate evaluation within a phase; workspace, scope and source view shall retain distinct identities; tolerant lock status shall not replace strict read failures, and a new phase shall retry completed local failures; compatible nested calls shall join without upgrading a document-only phase to physical caching; success, failure, interruption, mutation and replacement shall retire the owning phase; a fresh verification shall not reactivate its parent; cancelling one waiter shall preserve surviving demand, abandoned work shall be retryable, and expired readers shall observe live state; logical pending resolutions shall not claim persisted lockfile validity.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Production phase composition and document cells read real files, while deferred manifest observations make cancellation and coalescing deterministic.",
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("workspace read phase lifetime", () => {
  it.effect("shares narrow and inventory lock decodes only within the owning phase", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      const target = `${root}/axm.lock`;
      yield* fs.writeFileString(target, `version = ${LOCKFILE_VERSION}\n`);
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
              writeSettings: () => Effect.die("No document writes"),
              commitAcceptedResolutions: () => Effect.die("No document writes"),
            }),
          ),
        ),
        Layer.provide(
          Layer.succeed(PackManifests, {
            locate: () => {
              throw new Error("No Pack observation expected");
            },
          }),
        ),
      );
      const read = Effect.gen(function* () {
        const location = yield* WorkspaceLocation;
        const lock = yield* LockfileReader;
        expect((yield* lock.lockfile).lockfileVersion).toBe(LOCKFILE_VERSION);
        expect((yield* readLockfileCell(location, location.runtimeDir)).lockfileVersion).toBe(
          LOCKFILE_VERSION,
        );
        const model = yield* readModelFor(location, location.scope);
        expect((yield* model.state.lockfile)._tag).toBe("Some");
        yield* withWorkspaceObservationReadView(readLockfileCell(location, location.runtimeDir));
      });
      yield* Effect.gen(function* () {
        yield* withWorkspaceObservationReadView(read);
        expect(spans.filter((span) => span.name === "axm.parse.lockfile")).toHaveLength(1);
        yield* withWorkspaceObservationReadView(read);
        expect(spans.filter((span) => span.name === "axm.parse.lockfile")).toHaveLength(2);
        yield* fs.writeFileString(target, `version = ${LOCKFILE_VERSION + 1}\n`);
        const location = yield* WorkspaceLocation;
        expect(yield* Effect.flip(readLockfileCell(location, location.runtimeDir))).toMatchObject({
          _tag: "LockfileVersionUnsupported",
          observedVersion: LOCKFILE_VERSION + 1,
        });
      }).pipe(Effect.provide(layer), withDetailedWork(tracer));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

  it.effect("fresh verification retires retained parent observations", () =>
    Effect.gen(function* () {
      const live = yield* FileSystem.FileSystem;
      const root = yield* live.makeTempDirectoryScoped();
      const target = `${root}/observed.txt`;
      yield* live.writeFileString(target, "before");
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
              writeSettings: () => Effect.die("No document writes"),
              commitAcceptedResolutions: () => Effect.die("No document writes"),
            }),
          ),
        ),
        Layer.provide(
          Layer.succeed(PackManifests, {
            locate: () => {
              throw new Error("No Pack observation expected");
            },
          }),
        ),
      );
      yield* withWorkspaceObservationReadView(
        Effect.gen(function* () {
          const parent = yield* FileSystem.FileSystem;
          const parentPhase = yield* CurrentWorkspaceReadPhase;
          expect(yield* parent.readFileString(target)).toBe("before");
          // A normal nested query joins without closing the owning phase.
          yield* withWorkspaceObservationReadView(Effect.void);
          yield* live.writeFileString(target, "edited");
          expect(yield* parent.readFileString(target)).toBe("before");
          yield* withFreshWorkspaceObservationReadView(
            Effect.gen(function* () {
              const fresh = yield* FileSystem.FileSystem;
              expect(yield* fresh.readFileString(target)).toBe("edited");
              yield* fresh.writeFileString(target, "after verification");
            }),
          );
          expect(yield* parent.readFileString(target)).toBe("after verification");
          expect(parentPhase?.endedBy()).toBe("phase-exit");
        }),
      ).pipe(Effect.provide(layer));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );

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
                  const original = structuredClone(lossless);
                  const distinct = {
                    ...empty,
                    tool: { sample: { ...lossless.tool.sample, integer: "9007199254740993" } },
                  };
                  const candidate = desired.evaluate({
                    settings,
                    acceptedResolutions: lossless,
                  });
                  const first = yield* candidate;
                  Object.assign(lossless.tool.sample, { integer: "9007199254740993" });
                  const reused = yield* candidate;
                  const second = yield* desired.evaluate({
                    settings,
                    acceptedResolutions: lossless,
                  });
                  expect(reused).toBe(first);
                  expect(first.inputs.acceptedResolutions).toEqual(original);
                  expect(first.inputs.acceptedResolutions).not.toBe(lossless);
                  expect(second.inputs.acceptedResolutions).toEqual(distinct);
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
          expect(afterPhase.inputs.acceptedResolutions).toEqual(empty);
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

const phaseFixture = (root: string, overrides: Partial<WorkspaceLocationService> = {}) =>
  Layer.suspend(() =>
    Layer.fresh(
      WorkspaceReadViewsLive.pipe(
        Layer.provideMerge(
          Layer.effect(
            WorkspaceLocation,
            Effect.map(WorkspaceLocation, (location) => ({ ...location, ...overrides })),
          ).pipe(Layer.provideMerge(WorkspaceReadTest({ baseDir: root }))),
        ),
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
              writeSettings: () => Effect.die("No document writes expected"),
              commitAcceptedResolutions: () => Effect.die("No document writes expected"),
            }),
          ),
        ),
        Layer.provide(
          Layer.succeed(PackManifests, {
            locate: () => {
              throw new Error("No Pack reads expected");
            },
          }),
        ),
      ),
    ),
  );

it.effect("retains an explicit filesystem capability after document observations expire", () =>
  Effect.gen(function* () {
    const live = yield* FileSystem.FileSystem;
    const root = yield* live.makeTempDirectoryScoped();
    const selected = `${root}/axm.json`;
    const constrained = `${root}/constrained.json`;
    yield* live.writeFileString(selected, '{"agents":["codex"]}');
    yield* live.writeFileString(constrained, '{"agents":["claude-code"]}');
    const fileSystem = FileSystem.make({
      ...live,
      readFile: (file) => live.readFile(file === selected ? constrained : file),
    });
    yield* Effect.gen(function* () {
      const factory = yield* WorkspaceReadViews;
      const readers = yield* factory.capture({ observations: true, fileSystem });
      const phase = Context.get(readers, CurrentWorkspaceReadPhase);
      if (phase === undefined) throw new Error("Expected captured phase");
      const agents = Effect.gen(function* () {
        const cells = yield* phase.stateLoaders("project");
        return Option.getOrThrow(yield* cells.settings).agents;
      });
      expect(yield* agents).toEqual(["claude-code"]);
      yield* live.writeFileString(constrained, '{"agents":["cursor"]}');
      expect(yield* agents).toEqual(["claude-code"]);
      phase.close();
      expect(yield* agents).toEqual(["cursor"]);
    }).pipe(Effect.provide(phaseFixture(root)));
  }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
);

for (const ending of ["success", "failure", "interruption"] as const) {
  it.effect(`document phase joins physical requests without upgrade and retires on ${ending}`, () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* Effect.gen(function* () {
        const entered = yield* Deferred.make<WorkspaceReadPhaseState>();
        const fiber = yield* withWorkspaceReadView(
          Effect.gen(function* () {
            const phase = yield* CurrentWorkspaceReadPhase;
            if (phase === undefined) throw new Error("Expected a production phase");
            yield* Deferred.succeed(entered, phase);
            yield* withWorkspaceObservationReadView(
              Effect.gen(function* () {
                expect(yield* CurrentWorkspaceReadPhase).toBe(phase);
                expect(phase.observations).toBe(false);
              }),
            );
            expect(phase.isActive()).toBe(true);
            if (ending === "failure") return yield* Effect.fail("expected failure");
            if (ending === "interruption") return yield* Effect.never;
          }),
        ).pipe(Effect.forkChild);
        const phase = yield* Deferred.await(entered);
        if (ending === "interruption") yield* Fiber.interrupt(fiber);
        const exit = yield* Fiber.await(fiber);
        expect(Exit.isSuccess(exit)).toBe(ending === "success");
        if (ending === "interruption") expect(Exit.hasInterrupts(exit)).toBe(true);
        expect(phase.isActive()).toBe(false);
        expect(phase.endedBy()).toBe("phase-exit");
      }).pipe(Effect.provide(phaseFixture(root)));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );
}

it.effect(
  "an incompatible workspace phase retires the parent instead of restoring stale reads",
  () =>
    Effect.gen(function* () {
      const live = yield* FileSystem.FileSystem;
      const root = yield* live.makeTempDirectoryScoped();
      const other = yield* live.makeTempDirectoryScoped();
      const file = `${root}/observed.txt`;
      yield* live.writeFileString(file, "before");
      yield* withWorkspaceObservationReadView(
        Effect.gen(function* () {
          const parent = yield* CurrentWorkspaceReadPhase;
          const reader = yield* FileSystem.FileSystem;
          expect(yield* reader.readFileString(file)).toBe("before");
          yield* live.writeFileString(file, "after");
          yield* withWorkspaceObservationReadView(
            Effect.gen(function* () {
              expect(yield* CurrentWorkspaceReadPhase).not.toBe(parent);
              expect(parent?.isActive()).toBe(false);
            }),
          ).pipe(Effect.provide(phaseFixture(other)));
          expect(parent?.endedBy()).toBe("changed-input");
          expect(yield* reader.readFileString(file)).toBe("after");
        }),
      ).pipe(Effect.provide(phaseFixture(root)));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
);

for (const coincident of [false, true]) {
  it.effect(`project and user document cells retain scope identity (same path=${coincident})`, () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      const userRoot = `${root}/.axm/workspace`;
      yield* fs.makeDirectory(userRoot, { recursive: true });
      yield* fs.writeFileString(`${root}/axm.json`, '{"agents":["codex"]}');
      yield* fs.writeFileString(`${userRoot}/axm.json`, '{"agents":["claude-code"]}');
      const spans: Tracer.NativeSpan[] = [];
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      yield* withWorkspaceReadView(
        Effect.gen(function* () {
          const location = yield* WorkspaceLocation;
          const phase = yield* CurrentWorkspaceReadPhase;
          if (phase === undefined) throw new Error("Expected phase");
          const project = yield* phase.stateLoaders("project");
          const user = yield* phase.stateLoaders("user");
          expect(project).not.toBe(user);
          for (let repeat = 0; repeat < 2; repeat++) {
            expect(
              Option.getOrThrow(yield* readSettingsCell(location, location.runtimeDir, "project"))
                .agents,
            ).toEqual([coincident ? "claude-code" : "codex"]);
            expect(
              Option.getOrThrow(yield* readSettingsCell(location, location.runtimeDir, "user"))
                .agents,
            ).toEqual(["claude-code"]);
          }
        }),
      ).pipe(
        Effect.provide(
          phaseFixture(root, coincident ? { projectRoot: decodeAbsolutePathSync(userRoot) } : {}),
        ),
        withDetailedWork(tracer),
      );
      expect(spans.filter((span) => span.name === "axm.parse.settings")).toHaveLength(2);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );
}

for (const problem of [
  { bytes: "[[invalid", tag: "LockfileParseError" },
  { bytes: "version = 1\nskills = 42\n", tag: "LockfileDecodeError" },
  { bytes: "version = 999\n", tag: "LockfileVersionUnsupported" },
]) {
  it.effect(`tolerant status preserves ${problem.tag} until a fresh phase retries`, () =>
    Effect.gen(function* () {
      const live = yield* FileSystem.FileSystem;
      const root = yield* live.makeTempDirectoryScoped();
      const file = `${root}/axm.lock`;
      yield* live.writeFileString(file, problem.bytes);
      yield* withWorkspaceReadView(
        Effect.gen(function* () {
          const locks = yield* LockfileReader;
          expect(yield* locks.state).toBe("invalid");
          expect(yield* Effect.flip(locks.lockfile)).toMatchObject({ _tag: problem.tag });
          yield* live.writeFileString(file, `version = ${LOCKFILE_VERSION}\n`);
          expect(yield* Effect.flip(locks.lockfile)).toMatchObject({ _tag: problem.tag });
          yield* withFreshWorkspaceObservationReadView(
            Effect.gen(function* () {
              const fresh = yield* LockfileReader;
              expect(yield* fresh.state).toBe("ok");
              expect((yield* fresh.lockfile).lockfileVersion).toBe(LOCKFILE_VERSION);
            }),
          );
        }),
      ).pipe(Effect.provide(phaseFixture(root)));
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
  );
}

it.effect("a captured Git-index view neither aliases live bytes nor inherits user settings", () =>
  Effect.gen(function* () {
    const live = yield* FileSystem.FileSystem;
    const root = yield* live.makeTempDirectoryScoped();
    const snapshot = yield* live.makeTempDirectoryScoped();
    yield* live.writeFileString(`${root}/axm.json`, '{"agents":["claude-code"]}');
    yield* live.writeFileString(`${snapshot}/axm.json`, '{"agents":["codex"]}');
    const view: NativeObservationView = {
      kind: "git-index",
      readRoot: snapshot,
      displayRoot: root,
      fingerprint: "captured-index",
    };
    yield* withWorkspaceObservationReadView(
      Effect.gen(function* () {
        const settings = yield* SettingsReader;
        expect(yield* settings.configuredAgents).toEqual(["claude-code"]);
        const parent = yield* CurrentWorkspaceReadPhase;
        yield* withWorkspaceObservationReadView(
          Effect.gen(function* () {
            const staged = yield* SettingsReader;
            const location = yield* WorkspaceLocation;
            expect(location.observationView).toEqual(view);
            expect((yield* CurrentWorkspaceReadPhase)?.location).toBe(location);
            expect(yield* staged.configuredAgents).toEqual(["codex"]);
            expect(yield* readSettingsCell(location, location.runtimeDir, "user")).toEqual(
              Option.none(),
            );
            expect(
              (yield* (yield* DesiredStateReader).evaluate()).inputs.inheritedSettings,
            ).toEqual({});
          }),
        ).pipe(
          Effect.provide(
            phaseFixture(snapshot, { observationView: view }).pipe(
              Layer.provide(observationViewLayer(view)),
            ),
          ),
        );
        expect(parent?.isActive()).toBe(false);
        expect(parent?.endedBy()).toBe("changed-input");
      }),
    ).pipe(Effect.provide(phaseFixture(root)));
  }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
);
