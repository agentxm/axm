/**
 * Closure settlement on a real temporary filesystem: each semantic closure
 * either commits or restores exactly its own writes, independently of the
 * closures beside it, and a restoration that cannot complete is reported as
 * a typed in-memory fact rather than a later workspace write.
 */

import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { protectWorkspacePath } from "./context.js";
import { acquireWorkspaceTransition, WorkspaceTransactionScope } from "./scope.js";
import {
  injectWriteFaults,
  makeMemoryTransitionLockWorld,
  WorkspaceTransactionScopeTest,
} from "./testing.js";
import {
  pendingClosureRestorations,
  rollbackWorkspaceClosure,
  runWorkspaceTransaction,
  settleWorkspaceClosure,
  withWorkspaceClosure,
} from "./transaction.js";

describe("closure settlement", () => {
  let root: string;
  let workspaceDir: string;
  let settingsPath: string;
  let lockPath: string;
  let canonicalFile: string;
  let projectionPath: string;

  beforeEach(() => {
    root = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-closure-"));
    workspaceDir = nodePath.join(root, ".axm");
    settingsPath = nodePath.join(root, "axm.json");
    lockPath = nodePath.join(root, "axm-lock.yaml");
    canonicalFile = nodePath.join(root, "agent_extensions", "acme", "skills", "alpha", "SKILL.md");
    projectionPath = nodePath.join(root, ".claude", "skills", "alpha", "SKILL.md");
    nodeFs.mkdirSync(workspaceDir, { recursive: true });
    nodeFs.mkdirSync(nodePath.dirname(canonicalFile), { recursive: true });
    nodeFs.mkdirSync(nodePath.dirname(projectionPath), { recursive: true });
    nodeFs.writeFileSync(settingsPath, '{"skills":{}}\n');
    nodeFs.writeFileSync(lockPath, "lockfileVersion: 7\nskills: {}\n");
    nodeFs.writeFileSync(canonicalFile, "# alpha v1\n");
    nodeFs.writeFileSync(projectionPath, "# projected v1\n");
  });

  afterEach(() => {
    nodeFs.rmSync(root, { recursive: true, force: true });
  });

  const scope = () => WorkspaceTransactionScopeTest({ workspaceDir, settingsPath, lockPath });

  const read = (target: string) => nodeFs.readFileSync(target, "utf8");

  /** Protect then overwrite, the way every workspace writer does. */
  const write = (target: string, content: string) =>
    protectWorkspacePath(target).pipe(
      Effect.andThen(
        Effect.flatMap(FileSystem.FileSystem, (fs) => fs.writeFileString(target, content)),
      ),
    );

  const families = () => [settingsPath, lockPath, canonicalFile, projectionPath];

  it.effect(
    "a closure that fails after writing settings, lock, canonical content, and a projection restores all four byte-for-byte while the earlier settled closure stays committed",
    () =>
      Effect.gen(function* () {
        yield* runWorkspaceTransaction({
          claimDefaultTargets: false,
          transition: Effect.gen(function* () {
            yield* withWorkspaceClosure("alpha")(
              Effect.forEach(families(), (target) => write(target, `alpha: ${target}\n`)),
            );
            yield* settleWorkspaceClosure("alpha");
            yield* withWorkspaceClosure("beta")(
              Effect.forEach(families(), (target) => write(target, `beta: ${target}\n`)),
            );
            yield* rollbackWorkspaceClosure("beta");
          }),
          validate: () => Effect.void,
        });
        for (const target of families()) {
          expect(read(target)).toBe(`alpha: ${target}\n`);
        }
        expect(nodeFs.existsSync(nodePath.join(workspaceDir, "tmp"))).toBe(false);
      }).pipe(Effect.provide(Layer.mergeAll(NodeServices.layer, scope()))),
  );

  it.effect(
    "independent closures settle independently: a failed closure restores only itself",
    () =>
      Effect.gen(function* () {
        const a = nodePath.join(root, "a.txt");
        const b = nodePath.join(root, "b.txt");
        const c = nodePath.join(root, "c.txt");
        for (const target of [a, b, c]) nodeFs.writeFileSync(target, "original\n");
        yield* runWorkspaceTransaction({
          claimDefaultTargets: false,
          transition: Effect.gen(function* () {
            yield* withWorkspaceClosure("a")(write(a, "changed\n"));
            yield* settleWorkspaceClosure("a");
            yield* withWorkspaceClosure("b")(write(b, "changed\n"));
            yield* rollbackWorkspaceClosure("b");
            yield* withWorkspaceClosure("c")(write(c, "changed\n"));
            yield* settleWorkspaceClosure("c");
          }),
          validate: () => Effect.void,
        });
        expect([read(a), read(b), read(c)]).toEqual(["changed\n", "original\n", "changed\n"]);
        expect(yield* pendingClosureRestorations).toEqual(Option.none());
      }).pipe(Effect.provide(Layer.mergeAll(NodeServices.layer, scope()))),
  );

  it.effect(
    "a write fault injected at the projection step fails that closure alone and its settled predecessor stands",
    () =>
      Effect.gen(function* () {
        const outcome = yield* runWorkspaceTransaction({
          claimDefaultTargets: false,
          transition: Effect.gen(function* () {
            yield* withWorkspaceClosure("alpha")(write(settingsPath, '{"skills":{"alpha":1}}\n'));
            yield* settleWorkspaceClosure("alpha");
            const result = yield* withWorkspaceClosure("beta")(
              write(lockPath, "lockfileVersion: 7\nskills: { beta: {} }\n").pipe(
                Effect.andThen(write(canonicalFile, "# beta\n")),
                Effect.andThen(write(projectionPath, "# projected beta\n")),
                Effect.result,
              ),
            );
            yield* rollbackWorkspaceClosure("beta");
            return result;
          }),
          validate: () => Effect.void,
        });
        expect(outcome._tag).toBe("Failure");
        expect(read(settingsPath)).toBe('{"skills":{"alpha":1}}\n');
        expect(read(lockPath)).toBe("lockfileVersion: 7\nskills: {}\n");
        expect(read(canonicalFile)).toBe("# alpha v1\n");
        expect(read(projectionPath)).toBe("# projected v1\n");
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            injectWriteFaults(
              (operation) =>
                operation.kind === "writeFileString" && operation.path === projectionPath,
            ),
            scope(),
          ).pipe(Layer.provideMerge(NodeServices.layer)),
        ),
      ),
  );

  it.effect(
    "a restoration that cannot complete yields the typed pending fact naming the retained paths and the preserved snapshot directory",
    () =>
      Effect.gen(function* () {
        const pending = yield* runWorkspaceTransaction({
          claimDefaultTargets: false,
          transition: Effect.gen(function* () {
            yield* withWorkspaceClosure("beta")(write(settingsPath, '{"skills":{"beta":1}}\n'));
            yield* rollbackWorkspaceClosure("beta");
            return yield* pendingClosureRestorations;
          }),
          validate: () => Effect.void,
        });
        expect(Option.isSome(pending)).toBe(true);
        if (Option.isNone(pending)) return;
        const snapshotDir = pending.value.snapshotDir;
        expect(pending.value.failures.map((failure) => failure.closureId)).toEqual(["beta"]);
        expect(pending.value.failures[0]?.retained).toEqual(["axm.json"]);
        expect(snapshotDir).toBeDefined();
        // The failed restoration left the target as the failure left it and
        // preserved the pre-change bytes outside the workspace.
        expect(read(settingsPath)).toBe('{"skills":{"beta":1}}\n');
        expect(nodeFs.existsSync(snapshotDir ?? "")).toBe(true);
        expect(read(nodePath.join(snapshotDir ?? "", "0.snap"))).toBe('{"skills":{}}\n');
        if (snapshotDir !== undefined) nodeFs.rmSync(snapshotDir, { recursive: true, force: true });
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            injectWriteFaults(
              (operation) =>
                operation.kind === "copy" && operation.source.includes("axm-rollback-"),
            ),
            scope(),
          ).pipe(Layer.provideMerge(NodeServices.layer)),
        ),
      ),
  );

  it.effect("a transaction started inside a closure joins it and restores with it", () =>
    Effect.gen(function* () {
      const nested = nodePath.join(root, "nested.txt");
      nodeFs.writeFileSync(nested, "original\n");
      yield* runWorkspaceTransaction({
        claimDefaultTargets: false,
        transition: Effect.gen(function* () {
          yield* withWorkspaceClosure("beta")(
            runWorkspaceTransaction({
              claimDefaultTargets: false,
              targets: [nested],
              transition: Effect.sync(() => nodeFs.writeFileSync(nested, "changed\n")),
              validate: () => Effect.void,
            }),
          );
          yield* rollbackWorkspaceClosure("beta");
        }),
        validate: () => Effect.void,
      });
      expect(read(nested)).toBe("original\n");
    }).pipe(Effect.provide(Layer.mergeAll(NodeServices.layer, scope()))),
  );

  it.effect("the closure API is a no-op outside a transaction", () =>
    Effect.gen(function* () {
      yield* settleWorkspaceClosure("none");
      yield* rollbackWorkspaceClosure("none");
      expect(yield* pendingClosureRestorations).toEqual(Option.none());
    }),
  );

  it.effect(
    "a transition in the memory scope acquires nothing on disk and observes acquisition under the hold",
    () => {
      const world = makeMemoryTransitionLockWorld();
      const observed: Array<string> = [];
      return Effect.gen(function* () {
        yield* world.onAcquired((holder) =>
          Effect.sync(() => {
            // A specification changes material state here, after
            // confirmation and before revalidation, to prove a stale
            // candidate performs no writes.
            observed.push(holder.command);
            nodeFs.writeFileSync(settingsPath, '{"skills":{"intruder":1}}\n');
          }),
        );
        const path = yield* Path.Path;
        yield* Effect.scoped(
          Effect.gen(function* () {
            const contention = yield* acquireWorkspaceTransition({ command: "install" });
            expect(Option.isNone(contention)).toBe(true);
            const scope = yield* WorkspaceTransactionScope;
            expect(Option.isSome(yield* scope.lock.held(path.resolve(workspaceDir)))).toBe(true);
            expect(nodeFs.existsSync(nodePath.join(workspaceDir, "tmp"))).toBe(false);
          }),
        );
        expect(observed).toEqual(["install"]);
        expect(read(settingsPath)).toBe('{"skills":{"intruder":1}}\n');
        expect(world.counts()).toEqual({ acquisitions: 1, releases: 1 });
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            NodeServices.layer,
            WorkspaceTransactionScopeTest(
              { workspaceDir, settingsPath, lockPath },
              { lock: world.invocation() },
            ),
          ),
        ),
      );
    },
  );
});
