import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { expect, layer } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import { inspectKnowledgePackage } from "@agentxm/extension-content/knowledge";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { NativePlatformTest } from "../../locations/testing.js";
import { WorkspaceFileWriteLocksLive } from "../../settlement/live.js";
import { WorkspaceStateTest } from "../testing.js";
import { inspectKnowledgePackageInPhase } from "./read-phase.js";
import { withWorkspaceObservationReadView, withWorkspaceReadView } from "./read-view.js";

/** A workspace with one complete Knowledge package and one without a manifest. */
const makeWorkspace = Effect.gen(function* () {
  const root = nodeFs.realpathSync(
    nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-knowledge-phase-")),
  );
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => nodeFs.rmSync(root, { recursive: true, force: true })),
  );
  const bundle = nodePath.join(root, "knowledge", "platform");
  nodeFs.mkdirSync(nodePath.join(bundle, "src"), { recursive: true });
  nodeFs.writeFileSync(
    nodePath.join(bundle, "knowledge.json"),
    JSON.stringify({
      owner: "@acme",
      type: "knowledge",
      name: "platform",
      version: "1.0.0",
      description: "Platform guidance",
      format: { name: "okf", version: "0.2" },
      bundleRoot: "src",
    }),
  );
  nodeFs.writeFileSync(
    nodePath.join(bundle, "src", "index.md"),
    '---\nokf_version: "0.2"\n---\n# Platform\n',
  );
  const missing = nodePath.join(root, "knowledge", "missing");
  nodeFs.mkdirSync(missing, { recursive: true });
  const state = WorkspaceStateTest({
    projectRoot: decodeAbsolutePathSync(root),
    scope: "project",
    allowUninitialized: true,
  }).pipe(
    Layer.provide(WorkspaceFileWriteLocksLive),
    Layer.provide(
      ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: `${root}/home` } })),
    ),
  );
  return { root, bundle, missing, state };
});

/** An inspection of `packageRoot` that counts its executions. */
const countedInspection = (packageRoot: string) => {
  const runs = { count: 0 };
  const inspect = Effect.sync(() => {
    runs.count += 1;
  }).pipe(Effect.andThen(inspectKnowledgePackage(packageRoot)));
  return { runs, inspect };
};

layer(NativePlatformTest, { excludeTestServices: true })(
  "Knowledge package inspections in a read phase",
  (it) => {
    it.effect("share one inspection per package root through the phase's observation port", () =>
      Effect.gen(function* () {
        const { bundle, state } = yield* makeWorkspace;
        const { runs, inspect } = countedInspection(bundle);
        const [first, second] = yield* withWorkspaceObservationReadView(
          Effect.all([
            inspectKnowledgePackageInPhase(bundle, inspect),
            inspectKnowledgePackageInPhase(bundle, inspect),
          ]),
        ).pipe(Effect.provide(state));
        expect(runs.count).toBe(1);
        expect(second).toBe(first);
        expect(second.inspection.concepts).toHaveLength(1);
        // The shared value reaches a second consumer frozen throughout.
        expect(Object.isFrozen(second)).toBe(true);
        expect(Object.isFrozen(second.inspection.concepts)).toBe(true);
        expect(Object.isFrozen(second.inspection.diagnostics)).toBe(true);
      }).pipe(Effect.scoped),
    );

    it.effect("share a failed inspection's failure with every consumer", () =>
      Effect.gen(function* () {
        const { missing, state } = yield* makeWorkspace;
        const { runs, inspect } = countedInspection(missing);
        const [first, second] = yield* withWorkspaceObservationReadView(
          Effect.all([
            inspectKnowledgePackageInPhase(missing, inspect).pipe(Effect.flip),
            inspectKnowledgePackageInPhase(missing, inspect).pipe(Effect.flip),
          ]),
        ).pipe(Effect.provide(state));
        expect(runs.count).toBe(1);
        expect(second).toBe(first);
        expect(String(second)).toBe(
          String(yield* inspectKnowledgePackage(missing).pipe(Effect.flip)),
        );
      }).pipe(Effect.scoped),
    );

    it.effect("inspect separately for another root spelling, port, phase or lifetime", () =>
      Effect.gen(function* () {
        const { bundle, state } = yield* makeWorkspace;
        const { runs, inspect } = countedInspection(bundle);
        const twice = Effect.all([
          inspectKnowledgePackageInPhase(bundle, inspect),
          inspectKnowledgePackageInPhase(bundle, inspect),
        ]);

        // No phase.
        yield* twice.pipe(Effect.provide(state));
        expect(runs.count).toBe(2);

        // A document-only phase observes live content.
        yield* withWorkspaceReadView(twice).pipe(Effect.provide(state));
        expect(runs.count).toBe(4);

        // Another filesystem port than the phase's own observation port.
        yield* withWorkspaceObservationReadView(
          Effect.gen(function* () {
            const phaseFs = yield* FileSystem.FileSystem;
            const other: FileSystem.FileSystem = { ...phaseFs };
            yield* twice.pipe(Effect.provideService(FileSystem.FileSystem, other));
          }),
        ).pipe(Effect.provide(state));
        expect(runs.count).toBe(6);

        // A different spelling of the same root is a different key.
        const alias = `${bundle}/`;
        const aliased = countedInspection(alias);
        yield* withWorkspaceObservationReadView(
          Effect.all([
            inspectKnowledgePackageInPhase(bundle, inspect),
            inspectKnowledgePackageInPhase(alias, aliased.inspect),
          ]),
        ).pipe(Effect.provide(state));
        expect(runs.count).toBe(7);
        expect(aliased.runs.count).toBe(1);

        // A consumer retained past its phase inspects live content.
        const retained = yield* withWorkspaceObservationReadView(
          inspectKnowledgePackageInPhase(bundle, inspect).pipe(
            Effect.as(inspectKnowledgePackageInPhase(bundle, inspect)),
          ),
        ).pipe(Effect.provide(state));
        expect(runs.count).toBe(8);
        yield* retained.pipe(Effect.provide(state));
        expect(runs.count).toBe(9);
      }).pipe(Effect.scoped),
    );

    it.effect("rerun an inspection whose first consumer was interrupted", () =>
      Effect.gen(function* () {
        const { bundle, state } = yield* makeWorkspace;
        const started = yield* Deferred.make<void>();
        const runs = { count: 0 };
        const inspect = Effect.gen(function* () {
          runs.count += 1;
          if (runs.count === 1) {
            yield* Deferred.succeed(started, undefined);
            return yield* Effect.never;
          }
          return yield* inspectKnowledgePackage(bundle);
        });
        const second = yield* withWorkspaceObservationReadView(
          Effect.gen(function* () {
            const first = yield* Effect.forkChild(inspectKnowledgePackageInPhase(bundle, inspect));
            yield* Deferred.await(started);
            const interrupted = yield* Fiber.interrupt(first).pipe(
              Effect.andThen(Fiber.await(first)),
            );
            expect(Exit.hasInterrupts(interrupted)).toBe(true);
            return yield* inspectKnowledgePackageInPhase(bundle, inspect);
          }),
        ).pipe(Effect.provide(state));
        expect(runs.count).toBe(2);
        expect(second.name).toBe("platform");
      }).pipe(Effect.scoped),
    );
  },
);
