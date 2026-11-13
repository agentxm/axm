import { defineSpecification } from "@agentxm/specification-metadata";
import { expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Tracer from "effect/Tracer";
import { NativePlatformTest, withDetailedWork } from "../../../../locations/testing.js";
import { createDefaultSettings } from "../../../desired/settings/index.js";
import { handle, WorkspaceReadTest } from "../../../testing.js";
import { DesiredStateReader } from "../../desired-state-reader.js";
import { WorkspaceRecords } from "../../workspace-records.js";
import { WorkspaceLocation } from "../../location.js";
import { LockfileReader } from "../../lockfile-reader.js";
import { PackManifests } from "../../pack-manifests.js";
import { CurrentWorkspaceReadPhase, type WorkspaceReadPhaseState } from "../../read-phase.js";
import { SettingsReader } from "../../settings-reader.js";
import { FilesystemPackManifests } from "./pack-manifests.js";

export const specification = defineSpecification({
  requirement: "workspace/workspace-state/pack-observations-are-phase-scoped",
  title: "Pack document reuse preserves ownership and phase lifetime",
  statement:
    "Equivalent Pack document reads within an active phase shall share decoding and immutable observations; cancelling one waiter shall preserve surviving demand, abandoned reads shall be retryable, and expired observations shall not replace live reads; reuse accounting shall describe executions and reuse independently of tracing being enabled.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "The production Pack manifest adapter reads real files through a counted filesystem and deferred reads make cancellation deterministic.",
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

it.effect.each([
  { abandon: false, tracing: true },
  { abandon: true, tracing: true },
  { abandon: true, tracing: false },
])(
  "accounts for Pack reads and retries abandoned work (abandon=$abandon, tracing=$tracing)",
  ({ abandon, tracing }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const directory = path.join(root, "packs", "bench-pack");
      yield* fs.makeDirectory(directory, { recursive: true });
      const manifestPath = path.join(directory, "pack.json");
      const document = {
        owner: "@acme",
        type: "pack",
        name: "bench-pack",
        version: "1.0.0",
        dependencies: {},
      };
      yield* fs.writeFileString(manifestPath, JSON.stringify(document));
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let reads = 0;
      const observedFs: FileSystem.FileSystem = {
        ...fs,
        readFileString: (...args) =>
          Effect.gen(function* () {
            const content = yield* fs.readFileString(...args);
            if (args[0] === manifestPath) {
              reads += 1;
              if (reads === 1) {
                yield* Deferred.succeed(entered, undefined);
                yield* Deferred.await(release);
              }
            }
            return content;
          }),
      };
      const spans: Tracer.NativeSpan[] = [];
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      yield* Effect.gen(function* () {
        const manifests = yield* PackManifests;
        let active = true;
        const phase: WorkspaceReadPhaseState = {
          location: yield* WorkspaceLocation,
          observations: true,
          stateLoaders: () => Effect.die("Pack-only observation does not read workspace documents"),
          records: yield* WorkspaceRecords,
          fileSystem: observedFs,
          readers: {
            desired: yield* DesiredStateReader,
            locks: yield* LockfileReader,
            settings: yield* SettingsReader,
          },
          packDocuments: new Map(),
          isActive: () => active,
          endedBy: () => (active ? undefined : "phase-exit"),
          close: () => {
            active = false;
          },
        };
        const read = manifests
          .locate({
            owner: handle("@acme"),
            name: "bench-pack",
            relativeTo: root,
            workspace: { baseDir: root, settings: createDefaultSettings() },
          })
          .manifest.pipe(Effect.provideService(CurrentWorkspaceReadPhase, phase));
        let first = yield* read.pipe(Effect.forkChild({ startImmediately: true }));
        yield* Deferred.await(entered);
        const cancelled = yield* read.pipe(Effect.forkChild({ startImmediately: true }));
        yield* Fiber.interrupt(cancelled);
        expect(Exit.hasInterrupts(yield* Fiber.await(cancelled))).toBe(true);
        if (abandon) {
          yield* Fiber.interrupt(first);
          expect(Exit.hasInterrupts(yield* Fiber.await(first))).toBe(true);
          first = yield* read.pipe(Effect.forkChild({ startImmediately: true }));
        }
        const second = yield* read.pipe(Effect.forkChild({ startImmediately: true }));
        yield* Deferred.succeed(release, undefined);
        const original = yield* Fiber.join(first);
        expect(original.status).toBe("decoded");
        expect(yield* Fiber.join(second)).toBe(original);
        if (original.status === "decoded")
          Reflect.set(original.manifest.dependencies, "@acme/skills/injected", "^1.0.0");
        const reused = yield* read;
        expect(reused).toBe(original);
        if (reused.status === "decoded") expect(reused.manifest.dependencies).toEqual({});
        phase.close();
        yield* fs.writeFileString(manifestPath, JSON.stringify({ ...document, version: "2.0.0" }));
        const fresh = yield* read;
        expect(fresh.status).toBe("decoded");
        if (fresh.status === "decoded") expect(fresh.manifest.version).toBe("2.0.0");
        expect(fresh).not.toBe(original);
      }).pipe(
        Effect.provide(
          Layer.mergeAll(WorkspaceReadTest({ baseDir: root }), FilesystemPackManifests),
        ),
        withDetailedWork(tracer),
        Effect.withTracerEnabled(tracing),
      );
      expect(reads).toBe(abandon ? 3 : 2);
      if (!tracing) {
        expect(spans).toHaveLength(0);
        return;
      }
      const requests = spans.filter((span) => span.name === "axm.observation.pack-reuse");
      expect(requests.map((span) => span.attributes.get("axm.cache.outcome"))).toEqual([
        "miss",
        "coalesced",
        ...(abandon ? ["miss"] : []),
        "coalesced",
        "hit",
        "bypass",
      ]);
      expect(requests.map((span) => span.attributes.get("axm.work.executed"))).toEqual([
        1,
        0,
        ...(abandon ? [1] : []),
        0,
        0,
        1,
      ]);
      expect(requests.map((span) => span.attributes.get("axm.work.reused-count"))).toEqual([
        0,
        0,
        ...(abandon ? [0] : []),
        1,
        1,
        0,
      ]);
      expect(spans.filter((span) => span.name === "axm.parse.manifest")).toHaveLength(2);
      expect(JSON.stringify(spans.map((span) => [...span.attributes]))).not.toContain(manifestPath);
    }).pipe(Effect.scoped, Effect.provide(NativePlatformTest)),
);
