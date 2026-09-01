import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";
import * as Ref from "effect/Ref";
import * as Semaphore from "effect/Semaphore";

import { makeAppError, type AppError } from "../../app-error/index.js";
import { restorationIncompleteToAppError } from "../../app-error/conversions.js";
import {
  protectWorkspacePath,
  WorkspaceRestorationIncomplete,
  type WorkspaceTransactionFailure,
} from "../transaction.js";
import {
  runWorkspaceTransaction as runWorkspaceTransactionWithSemaphore,
  type WorkspaceTransactionArgs,
} from "./transaction.js";
import { acquireWorkspaceTransitionLock } from "./transition-lock.js";

let transactionSemaphore: Semaphore.Semaphore;

const runWorkspaceTransaction = <A, E, R>(
  args: Omit<WorkspaceTransactionArgs<A, E, R>, "semaphore">,
) => runWorkspaceTransactionWithSemaphore({ ...args, semaphore: transactionSemaphore });

const detailOf = (
  error: AppError | WorkspaceTransactionFailure | WorkspaceRestorationIncomplete,
): string =>
  error._tag === "AppError"
    ? error.detail
    : error._tag === "WorkspaceRestorationIncomplete"
      ? `restoration-incomplete:${error.snapshotDir ?? "<none>"}`
      : `machinery:${error._tag}`;

const withContext = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provide(NodeServices.layer));

describe("runWorkspaceTransaction", () => {
  let tempDir: string;
  let workspaceDir: string;
  let settingsPath: string;
  let canonicalPath: string;

  beforeEach(() => {
    transactionSemaphore = Semaphore.makeUnsafe(1);
    tempDir = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "workspace-transaction-test-"));
    workspaceDir = nodePath.join(tempDir, ".axm");
    settingsPath = nodePath.join(tempDir, "axm.json");
    canonicalPath = nodePath.join(tempDir, "agent_extensions", "demo");
    nodeFs.mkdirSync(canonicalPath, { recursive: true });
    nodeFs.writeFileSync(settingsPath, '{"future":{"value":1}}\n');
    nodeFs.writeFileSync(nodePath.join(canonicalPath, "content.txt"), "before\n");
  });

  afterEach(() => {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("restores every target when the transition fails", () =>
    withContext(
      runWorkspaceTransaction({
        workspaceDir,
        targets: [settingsPath],
        transition: Effect.gen(function* () {
          yield* protectWorkspacePath(canonicalPath);
          yield* Effect.sync(() => {
            nodeFs.writeFileSync(settingsPath, '{"changed":true}\n');
            nodeFs.rmSync(canonicalPath, { recursive: true });
            nodeFs.mkdirSync(canonicalPath, { recursive: true });
            nodeFs.writeFileSync(nodePath.join(canonicalPath, "content.txt"), "after\n");
          });
          return yield* makeAppError({
            code: "internal",
            detail: "injected transition failure",
          });
        }),
        validate: () => Effect.void,
      }).pipe(
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(detailOf(error)).toBe("injected transition failure");
            expect(nodeFs.readFileSync(settingsPath, "utf8")).toBe('{"future":{"value":1}}\n');
            expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "content.txt"), "utf8")).toBe(
              "before\n",
            );
            // No recovery state persists in the workspace, ever.
            expect(nodeFs.existsSync(nodePath.join(workspaceDir, "tmp", "recovery"))).toBe(false);
          }),
        ),
      ),
    ),
  );

  it.effect("restores every authoritative state family after an injected write failure", () => {
    const lockfilePath = nodePath.join(tempDir, "axm-lock.yaml");
    const canonicalFile = nodePath.join(canonicalPath, "content.txt");
    const projectionPath = nodePath.join(tempDir, ".claude", "skills", "demo", "SKILL.md");
    nodeFs.mkdirSync(nodePath.dirname(projectionPath), { recursive: true });
    nodeFs.writeFileSync(lockfilePath, "lockfileVersion: 4\nskills: {}\n");
    nodeFs.writeFileSync(projectionPath, "projected before\n");

    const families = [
      { family: "desired settings", target: settingsPath },
      { family: "observed canonical content", target: canonicalFile },
      { family: "managed projection", target: projectionPath },
      { family: "accepted lock state", target: lockfilePath },
    ] as const;

    return withContext(
      Effect.forEach(
        families,
        ({ family, target }) => {
          const before = nodeFs.readFileSync(target, "utf8");
          return runWorkspaceTransaction({
            workspaceDir,
            targets: [target],
            transition: Effect.sync(() => nodeFs.writeFileSync(target, `${family} changed\n`)).pipe(
              Effect.andThen(
                Effect.fail(makeAppError({ code: "internal", detail: `${family} failure` })),
              ),
            ),
            validate: () => Effect.void,
          }).pipe(
            Effect.flip,
            Effect.tap((error) =>
              Effect.sync(() => {
                expect(detailOf(error)).toBe(`${family} failure`);
                expect(nodeFs.readFileSync(target, "utf8"), family).toBe(before);
              }),
            ),
          );
        },
        { discard: true },
      ),
    );
  });

  it.effect("removes targets that did not exist before a failed transition", () => {
    const createdPath = nodePath.join(workspaceDir, "created.json");
    return withContext(
      runWorkspaceTransaction({
        workspaceDir,
        targets: [createdPath],
        transition: Effect.sync(() => nodeFs.writeFileSync(createdPath, "created\n")).pipe(
          Effect.andThen(
            Effect.fail(makeAppError({ code: "internal", detail: "injected transition failure" })),
          ),
        ),
        validate: () => Effect.void,
      }).pipe(
        Effect.flip,
        Effect.tap(() => Effect.sync(() => expect(nodeFs.existsSync(createdPath)).toBe(false))),
      ),
    );
  });

  it.effect("removes a newly created empty workspace after a failed first transition", () => {
    const absentWorkspaceDir = nodePath.join(tempDir, "new-workspace", ".axm");
    const createdPath = nodePath.join(absentWorkspaceDir, "axm.json");
    return withContext(
      runWorkspaceTransaction({
        workspaceDir: absentWorkspaceDir,
        targets: [createdPath],
        transition: Effect.sync(() => nodeFs.writeFileSync(createdPath, "created\n")).pipe(
          Effect.andThen(
            Effect.fail(makeAppError({ code: "internal", detail: "injected transition failure" })),
          ),
        ),
        validate: () => Effect.void,
      }).pipe(
        Effect.flip,
        Effect.tap(() =>
          Effect.sync(() => {
            expect(nodeFs.existsSync(absentWorkspaceDir)).toBe(false);
          }),
        ),
      ),
    );
  });

  it.effect("rolls back when postcondition validation fails", () =>
    withContext(
      runWorkspaceTransaction({
        workspaceDir,
        targets: [settingsPath],
        transition: Effect.sync(() => nodeFs.writeFileSync(settingsPath, '{"changed":true}\n')),
        validate: () =>
          Effect.fail(makeAppError({ code: "validation", detail: "postcondition invalid" })),
      }).pipe(
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(detailOf(error)).toBe("postcondition invalid");
            expect(nodeFs.readFileSync(settingsPath, "utf8")).toBe('{"future":{"value":1}}\n');
          }),
        ),
      ),
    ),
  );

  it.effect("rolls back prior nested targets when a later nested target fails", () => {
    const laterTarget = nodePath.join(workspaceDir, "later.json");
    return withContext(
      runWorkspaceTransaction({
        workspaceDir,
        targets: [settingsPath],
        transition: Effect.gen(function* () {
          yield* Effect.sync(() => nodeFs.writeFileSync(settingsPath, '{"changed":true}\n'));
          yield* runWorkspaceTransaction({
            workspaceDir,
            targets: [canonicalPath],
            transition: Effect.sync(() =>
              nodeFs.writeFileSync(nodePath.join(canonicalPath, "content.txt"), "after\n"),
            ),
            validate: () => Effect.void,
          });
          return yield* runWorkspaceTransaction({
            workspaceDir,
            targets: [laterTarget],
            transition: Effect.sync(() => nodeFs.writeFileSync(laterTarget, "created\n")).pipe(
              Effect.andThen(
                Effect.fail(
                  makeAppError({ code: "internal", detail: "injected later-target failure" }),
                ),
              ),
            ),
            validate: () => Effect.void,
          });
        }),
        validate: () => Effect.void,
      }).pipe(
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(detailOf(error)).toBe("injected later-target failure");
            expect(nodeFs.readFileSync(settingsPath, "utf8")).toBe('{"future":{"value":1}}\n');
            expect(nodeFs.readFileSync(nodePath.join(canonicalPath, "content.txt"), "utf8")).toBe(
              "before\n",
            );
            expect(nodeFs.existsSync(laterTarget)).toBe(false);
          }),
        ),
      ),
    );
  });

  it.effect("fails typed with retained snapshots when exact rollback fails", () => {
    const parent = nodePath.dirname(settingsPath);
    const movedParent = `${parent}-moved`;
    let snapshotDir: string | undefined;
    return withContext(
      runWorkspaceTransaction({
        workspaceDir,
        targets: [settingsPath],
        transition: Effect.sync(() => {
          nodeFs.renameSync(parent, movedParent);
          nodeFs.writeFileSync(parent, "blocks rollback");
        }).pipe(
          Effect.andThen(
            Effect.fail(makeAppError({ code: "internal", detail: "injected transition failure" })),
          ),
        ),
        validate: () => Effect.void,
      }).pipe(
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() => {
            // Restoration failure is a typed fact on the error channel; the
            // fixture's flip makes every post-failure workspace write fail
            // too (the workspace path is now a plain file), so the value —
            // not any later write or workspace record — must carry the truth.
            expect(error._tag).toBe("WorkspaceRestorationIncomplete");
            if (error._tag !== "WorkspaceRestorationIncomplete") return;
            snapshotDir = error.snapshotDir;
            expect(error.terminationCause).toBe("failure");
            expect(error.retained).toEqual([nodePath.join("axm.json")]);
            expect(restorationIncompleteToAppError(error).detail).toMatch(
              /^Transition failed: injected transition failure\. Workspace restoration did not complete;/,
            );
            expect(nodeFs.statSync(parent).isFile()).toBe(true);
            // The snapshot-before-write invariant put the pre-change bytes in
            // OS-temporary storage before the mutation, outside the
            // workspace, so the hostile rename cannot touch them — and the
            // failure preserves them for manual inspection.
            expect(snapshotDir).toBeDefined();
            expect(snapshotDir?.startsWith(tempDir)).toBe(false);
            expect(nodeFs.readFileSync(nodePath.join(snapshotDir ?? "", "0.snap"), "utf8")).toBe(
              '{"future":{"value":1}}\n',
            );
          }),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            nodeFs.rmSync(parent, { force: true });
            nodeFs.renameSync(movedParent, parent);
            if (snapshotDir !== undefined) {
              nodeFs.rmSync(snapshotDir, { recursive: true, force: true });
            }
          }),
        ),
      ),
    );
  });

  it("summarizes an untyped transition defect without exposing its stack", () => {
    const error = restorationIncompleteToAppError(
      new WorkspaceRestorationIncomplete({
        terminationCause: "failure",
        transitionCause: Cause.die(new Error("injected transition defect")),
        restorationCause: new Error("injected restoration defect"),
        snapshotDir: undefined,
        retained: ["axm.json"],
      }),
    );

    expect(error.detail).toBe(
      "Transition failed: Error: injected transition defect. Workspace restoration did not complete; the affected paths keep the state the failure left.",
    );
    expect(error.detail).not.toContain("transaction.internal.test.ts");
  });

  it.live("stops a compromised mutation without restoring over the successor", () => {
    const lockPath = nodePath.join(workspaceDir, "tmp", "workspace-transition.lock");
    let continued = false;
    let snapshotDir: string | undefined;
    return withContext(
      Effect.scoped(
        Effect.gen(function* () {
          // The invocation-level hold, with fast staleness so compromise
          // detection is prompt enough for a deterministic test.
          const contention = yield* acquireWorkspaceTransitionLock({
            workspaceDir,
            holder: { command: "update", pid: process.pid },
            timingMillis: { stale: 2000, update: 1000 },
          });
          expect(Option.isNone(contention)).toBe(true);
          const failure = yield* runWorkspaceTransaction({
            workspaceDir,
            targets: [settingsPath],
            transition: Effect.gen(function* () {
              yield* Effect.sync(() => {
                nodeFs.writeFileSync(settingsPath, '{"changed":true}\n');
                // A successor reclaims the stale hold mid-mutation, carrying
                // a distinct mtime as any real post-staleness reclaim would.
                nodeFs.rmSync(lockPath, { recursive: true, force: true });
                nodeFs.mkdirSync(lockPath, { recursive: true });
                const reclaimedAt = new Date(Date.now() + 60_000);
                nodeFs.utimesSync(lockPath, reclaimedAt, reclaimedAt);
              });
              // The compromise race interrupts this wait; nothing after it
              // may run once ownership is lost.
              yield* Effect.sleep("30 seconds");
              continued = true;
            }),
            validate: () => Effect.void,
          }).pipe(Effect.flip);
          expect(failure._tag).toBe("WorkspaceRestorationIncomplete");
          if (failure._tag !== "WorkspaceRestorationIncomplete") return;
          snapshotDir = failure.snapshotDir;
          expect(continued).toBe(false);
          const restoration: unknown = failure.restorationCause;
          expect(
            typeof restoration === "object" &&
              restoration !== null &&
              "_tag" in restoration &&
              restoration._tag === "WorkspaceTransitionCompromised",
          ).toBe(true);
          // No split-brain writes: the mutation stopped where it was, and
          // restoration was not attempted over the successor's workspace.
          expect(nodeFs.readFileSync(settingsPath, "utf8")).toBe('{"changed":true}\n');
          expect(failure.retained).toEqual([nodePath.join("axm.json")]);
          // The pre-change snapshot is preserved for manual recovery.
          expect(snapshotDir).toBeDefined();
          if (snapshotDir !== undefined) {
            expect(nodeFs.readFileSync(nodePath.join(snapshotDir, "0.snap"), "utf8")).toBe(
              '{"future":{"value":1}}\n',
            );
          }
        }),
      ).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            if (snapshotDir !== undefined) {
              nodeFs.rmSync(snapshotDir, { recursive: true, force: true });
            }
          }),
        ),
      ),
    );
  });

  // Restoration must stage before it publishes: a restore that removes the
  // target and then fails to copy has destroyed the only durable copy of the
  // failure-time state. A failed staging leaves the target exactly as the
  // failure left it.
  it.effect("a failed restoration copy leaves the target as the failure left it", () => {
    const restoreCopyFailingServices = Layer.effect(
      FileSystem.FileSystem,
      Effect.gen(function* () {
        const real = yield* FileSystem.FileSystem;
        return {
          ...real,
          copy: (...args: Parameters<FileSystem.FileSystem["copy"]>) =>
            // The restore direction copies out of the OS-temporary snapshot
            // store; the snapshot direction copies into it.
            args[0].includes("axm-rollback-")
              ? Effect.fail(
                  PlatformError.badArgument({
                    module: "FileSystem",
                    method: "copy",
                    description: "injected restoration copy failure",
                  }),
                )
              : real.copy(...args),
        };
      }),
    ).pipe(Layer.provideMerge(NodeServices.layer));
    let snapshotDir: string | undefined;
    return runWorkspaceTransaction({
      workspaceDir,
      targets: [settingsPath],
      transition: Effect.sync(() => nodeFs.writeFileSync(settingsPath, '{"changed":true}\n')).pipe(
        Effect.andThen(
          Effect.fail(makeAppError({ code: "internal", detail: "injected transition failure" })),
        ),
      ),
      validate: () => Effect.void,
    }).pipe(
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error._tag).toBe("WorkspaceRestorationIncomplete");
          if (error._tag !== "WorkspaceRestorationIncomplete") return;
          snapshotDir = error.snapshotDir;
          // The target keeps the failure-time state: staging failed before
          // publication, so the mutated bytes were never destroyed.
          expect(nodeFs.existsSync(settingsPath)).toBe(true);
          expect(nodeFs.readFileSync(settingsPath, "utf8")).toBe('{"changed":true}\n');
          // No staging residue survives beside the target.
          const siblings = nodeFs.readdirSync(nodePath.dirname(settingsPath));
          expect(siblings.filter((name) => name.startsWith("axm.json.tmp."))).toEqual([]);
        }),
      ),
      Effect.ensuring(
        Effect.sync(() => {
          if (snapshotDir !== undefined) {
            nodeFs.rmSync(snapshotDir, { recursive: true, force: true });
          }
        }),
      ),
      Effect.provide(restoreCopyFailingServices),
    );
  });

  // A file target is republished with one atomic rename: no interleaving of
  // operations may leave the authoritative path absent or partially written,
  // because abrupt termination can strike between any two of them.
  it.effect("file restoration publishes atomically without removing the target first", () => {
    const removed: Array<string> = [];
    const recordingServices = Layer.effect(
      FileSystem.FileSystem,
      Effect.gen(function* () {
        const real = yield* FileSystem.FileSystem;
        return {
          ...real,
          remove: (...args: Parameters<FileSystem.FileSystem["remove"]>) =>
            Effect.sync(() => {
              removed.push(args[0]);
            }).pipe(Effect.andThen(real.remove(...args))),
        };
      }),
    ).pipe(Layer.provideMerge(NodeServices.layer));
    return runWorkspaceTransaction({
      workspaceDir,
      targets: [settingsPath],
      transition: Effect.sync(() => nodeFs.writeFileSync(settingsPath, '{"changed":true}\n')).pipe(
        Effect.andThen(
          Effect.fail(makeAppError({ code: "internal", detail: "injected transition failure" })),
        ),
      ),
      validate: () => Effect.void,
    }).pipe(
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(detailOf(error)).toBe("injected transition failure");
          expect(nodeFs.readFileSync(settingsPath, "utf8")).toBe('{"future":{"value":1}}\n');
          // The authoritative path itself was never removed; only owned
          // `.tmp.` siblings and the snapshot store may be.
          expect(removed.filter((path) => path === settingsPath)).toEqual([]);
        }),
      ),
      Effect.provide(recordingServices),
    );
  });

  it.effect("serializes concurrent transitions for one workspace", () =>
    withContext(
      Effect.gen(function* () {
        const active = yield* Ref.make(0);
        const maximum = yield* Ref.make(0);
        const transition = runWorkspaceTransaction({
          workspaceDir,
          targets: [settingsPath],
          transition: Effect.gen(function* () {
            const current = yield* Ref.updateAndGet(active, (value) => value + 1);
            yield* Ref.update(maximum, (value) => Math.max(value, current));
            yield* Effect.yieldNow;
            yield* Ref.update(active, (value) => value - 1);
          }),
          validate: () => Effect.void,
        });
        yield* Effect.all([transition, transition], { concurrency: "unbounded" });
        expect(yield* Ref.get(maximum)).toBe(1);
      }),
    ),
  );

  it.effect("holds the workspace lock in project scratch and removes empty scratch", () =>
    withContext(
      Effect.gen(function* () {
        const scratchDir = nodePath.join(workspaceDir, "tmp");
        const lockPath = nodePath.join(scratchDir, "workspace-transition.lock");
        yield* runWorkspaceTransaction({
          workspaceDir,
          targets: [settingsPath],
          transition: Effect.sync(() => {
            expect(nodeFs.existsSync(lockPath)).toBe(true);
            nodeFs.writeFileSync(settingsPath, '{"changed":true}\n');
          }),
          validate: () => Effect.void,
        });
        expect(nodeFs.existsSync(scratchDir)).toBe(false);
      }),
    ),
  );

  it.effect("preserves unrelated project scratch entries", () =>
    withContext(
      Effect.gen(function* () {
        const scratchDir = nodePath.join(workspaceDir, "tmp");
        const unrelated = nodePath.join(scratchDir, "another-operation-123");
        nodeFs.mkdirSync(unrelated, { recursive: true });
        nodeFs.writeFileSync(nodePath.join(unrelated, "keep.txt"), "keep\n");

        yield* runWorkspaceTransaction({
          workspaceDir,
          targets: [settingsPath],
          transition: Effect.sync(() => nodeFs.writeFileSync(settingsPath, '{"changed":true}\n')),
          validate: () => Effect.void,
        });

        expect(nodeFs.readFileSync(nodePath.join(unrelated, "keep.txt"), "utf8")).toBe("keep\n");
        expect(nodeFs.existsSync(nodePath.join(scratchDir, "workspace-transition.lock"))).toBe(
          false,
        );
      }),
    ),
  );
});
