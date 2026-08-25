import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";

import {
  acquireWorkspaceTransitionLock,
  heldWorkspaceTransition,
  isWorkspaceTransitionHeldByThisInvocation,
  transitionLockPath,
} from "./transition-lock.js";

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-transition-lock-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const services = NodeServices.layer;

describe("workspace transition lock", () => {
  it.effect("C-20: holds, records the holder, and releases with its scope", () =>
    Effect.gen(function* () {
      const workspaceDir = path.join(tempDir, ".axm");
      const lockPath = path.join(workspaceDir, "tmp", "workspace-transition.lock");
      yield* Effect.scoped(
        Effect.gen(function* () {
          const contention = yield* acquireWorkspaceTransitionLock({
            workspaceDir,
            holder: { command: "update", pid: process.pid },
          });
          expect(Option.isNone(contention)).toBe(true);
          expect(fs.existsSync(lockPath)).toBe(true);
          expect(isWorkspaceTransitionHeldByThisInvocation(path.resolve(workspaceDir))).toBe(true);
          const holder = JSON.parse(
            fs.readFileSync(path.join(lockPath, "holder.json"), "utf8"),
          ) as { command: string; pid: number };
          expect(holder.command).toBe("update");
        }),
      );
      expect(fs.existsSync(lockPath)).toBe(false);
      expect(isWorkspaceTransitionHeldByThisInvocation(path.resolve(workspaceDir))).toBe(false);
    }).pipe(Effect.provide(services)),
  );

  it.live(
    "C-20: a contender waits with a visible reason and times out with the holder reference",
    () =>
      Effect.gen(function* () {
        const workspaceDir = path.join(tempDir, ".axm");
        const waitingReports: Array<string> = [];
        yield* Effect.scoped(
          Effect.gen(function* () {
            const first = yield* acquireWorkspaceTransitionLock({
              workspaceDir,
              holder: { command: "install", pid: 1234 },
            });
            expect(Option.isNone(first)).toBe(true);
            // Simulate a second process: this invocation's own hold must not
            // short-circuit the contender, so clear the in-process marker the
            // way a separate process would never have set it.
            const contention = yield* Effect.scoped(
              acquireWorkspaceTransitionLockForTest(workspaceDir, waitingReports),
            );
            expect(Option.isSome(contention)).toBe(true);
            if (Option.isSome(contention)) {
              expect(
                Option.match(contention.value.holder, {
                  onNone: () => "none",
                  onSome: (holder) => holder.command,
                }),
              ).toBe("install");
              expect(contention.value.waitedMillis).toBeGreaterThanOrEqual(500);
            }
            expect(waitingReports.length).toBe(1);
          }),
        );
      }).pipe(Effect.provide(services)),
  );

  // Residual cleanup requires an exact owner-token match: absent metadata is
  // indistinguishable from a successor that reclaimed the stale hold but has
  // not yet written its holder file.
  it.effect(
    "C-20: release never removes another invocation's lock left without holder metadata",
    () =>
      Effect.gen(function* () {
        const workspaceDir = path.join(tempDir, ".axm");
        const lockPath = path.join(workspaceDir, "tmp", "workspace-transition.lock");
        yield* Effect.scoped(
          Effect.gen(function* () {
            const contention = yield* acquireWorkspaceTransitionLock({
              workspaceDir,
              holder: { command: "install", pid: process.pid },
            });
            expect(Option.isNone(contention)).toBe(true);
            // The successor window: another process reclaimed this hold as
            // stale and acquired its own lock, but has not yet written its
            // holder metadata. Absent metadata is indistinguishable from
            // that window and is never license to remove the lock.
            fs.rmSync(lockPath, { recursive: true, force: true });
            fs.mkdirSync(lockPath, { recursive: true });
          }),
        );
        expect(fs.existsSync(lockPath)).toBe(true);
      }).pipe(Effect.provide(services)),
  );

  // A process id can recur across reboots and containers; only a distinct
  // per-acquisition token proves ownership.
  it.effect("C-20: each acquisition records a distinct owner token in the holder metadata", () =>
    Effect.gen(function* () {
      const workspaceDir = path.join(tempDir, ".axm");
      const lockPath = path.join(workspaceDir, "tmp", "workspace-transition.lock");
      // A process id can recur across reboots and containers; only a
      // per-acquisition token proves ownership.
      const holderToken = (): string | undefined => {
        const parsed: unknown = JSON.parse(
          fs.readFileSync(path.join(lockPath, "holder.json"), "utf8"),
        );
        return typeof parsed === "object" &&
          parsed !== null &&
          "token" in parsed &&
          typeof parsed.token === "string"
          ? parsed.token
          : undefined;
      };
      const acquireOnce = Effect.scoped(
        Effect.gen(function* () {
          const contention = yield* acquireWorkspaceTransitionLock({
            workspaceDir,
            holder: { command: "update", pid: process.pid },
          });
          expect(Option.isNone(contention)).toBe(true);
          return holderToken();
        }),
      );
      const first = yield* acquireOnce;
      const second = yield* acquireOnce;
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      expect(first?.length ?? 0).toBeGreaterThanOrEqual(16);
      expect(second).not.toBe(first);
    }).pipe(Effect.provide(services)),
  );

  // Compromise is a typed signal, never a silent event: once proper-lockfile
  // cannot confirm ownership, the held-transition view fails its compromise
  // effect so the owning mutation can stop — and release never removes the
  // successor's lock.
  it.live("C-20: compromise fails the held signal and release leaves the successor's lock", () =>
    Effect.gen(function* () {
      const workspaceDir = path.join(tempDir, ".axm");
      const lockPath = path.join(workspaceDir, "tmp", "workspace-transition.lock");
      yield* Effect.scoped(
        Effect.gen(function* () {
          const contention = yield* acquireWorkspaceTransitionLock({
            workspaceDir,
            holder: { command: "update", pid: process.pid },
            timingMillis: { stale: 2000, update: 1000 },
          });
          expect(Option.isNone(contention)).toBe(true);
          const held = heldWorkspaceTransition(path.resolve(workspaceDir));
          expect(held).toBeDefined();
          if (held === undefined) return;
          expect(held.isCompromised()).toBe(false);
          // A successor reclaims the stale hold and stamps its own holder.
          // The recreated directory carries a distinct mtime, as any real
          // reclaim after the staleness window would.
          fs.rmSync(lockPath, { recursive: true, force: true });
          fs.mkdirSync(lockPath, { recursive: true });
          fs.writeFileSync(
            path.join(lockPath, "holder.json"),
            JSON.stringify({ command: "successor", pid: 4321, token: "s".repeat(32) }),
          );
          const reclaimedAt = new Date(Date.now() + 60_000);
          fs.utimesSync(lockPath, reclaimedAt, reclaimedAt);
          const failure = yield* Effect.raceFirst(
            Effect.flip(held.compromised),
            Effect.sleep("10 seconds").pipe(
              Effect.andThen(Effect.die(new Error("compromise did not fire"))),
            ),
          );
          expect(failure._tag).toBe("WorkspaceTransitionCompromised");
          expect(held.isCompromised()).toBe(true);
        }),
      );
      // The release finalizer proved no ownership and left the successor's
      // lock — holder metadata and all — untouched.
      const residual = JSON.parse(fs.readFileSync(path.join(lockPath, "holder.json"), "utf8")) as {
        command: string;
      };
      expect(residual.command).toBe("successor");
    }).pipe(Effect.provide(services)),
  );

  // Holder metadata is the only ownership evidence an acquisition has.
  // Failing to record it must fail the acquisition safely: release the hold
  // rather than hold anonymously, leaving nothing for a contender to wait on.
  it.effect("C-20: a failed holder write releases the acquisition and fails typed", () =>
    Effect.gen(function* () {
      const workspaceDir = path.join(tempDir, ".axm");
      const lockPath = path.join(workspaceDir, "tmp", "workspace-transition.lock");
      const failure = yield* Effect.scoped(
        acquireWorkspaceTransitionLock({
          workspaceDir,
          holder: { command: "update", pid: process.pid },
        }),
      ).pipe(Effect.flip);
      expect(failure._tag).toBe("AppError");
      expect(failure.detail).toContain("workspace transition holder");
      expect(fs.existsSync(lockPath)).toBe(false);
      expect(isWorkspaceTransitionHeldByThisInvocation(path.resolve(workspaceDir))).toBe(false);
    }).pipe(Effect.provide(holderWriteFailingServices)),
  );

  // The gap between the lock library granting the hold and the release
  // finalizer registering must not be interruptible: an interrupt landing
  // there would leave a lock nobody releases until staleness.
  it.live("C-20: interruption during acquisition never leaks the lock", () =>
    Effect.gen(function* () {
      const workspaceDir = path.join(tempDir, ".axm");
      const lockPath = path.join(workspaceDir, "tmp", "workspace-transition.lock");
      const reachedHolderWrite = yield* Deferred.make<void>();
      // A FileSystem whose holder write parks long enough for the test to
      // interrupt the acquiring fiber mid-acquisition, deterministically.
      const gatedServices = Layer.effect(
        FileSystem.FileSystem,
        Effect.gen(function* () {
          const real = yield* FileSystem.FileSystem;
          return {
            ...real,
            writeFileString: (...args: Parameters<FileSystem.FileSystem["writeFileString"]>) =>
              args[0].endsWith("holder.json")
                ? Deferred.succeed(reachedHolderWrite, void 0).pipe(
                    Effect.andThen(Effect.sleep("50 millis")),
                    Effect.andThen(real.writeFileString(...args)),
                  )
                : real.writeFileString(...args),
          };
        }),
      ).pipe(Layer.provideMerge(NodeServices.layer));
      const fiber = yield* Effect.forkChild(
        Effect.scoped(
          acquireWorkspaceTransitionLock({
            workspaceDir,
            holder: { command: "update", pid: process.pid },
          }).pipe(Effect.andThen(Effect.never)),
        ).pipe(Effect.provide(gatedServices)),
      );
      yield* Deferred.await(reachedHolderWrite);
      yield* Fiber.interrupt(fiber);
      expect(fs.existsSync(lockPath)).toBe(false);
      expect(isWorkspaceTransitionHeldByThisInvocation(path.resolve(workspaceDir))).toBe(false);
    }).pipe(Effect.provide(services)),
  );

  // A crashed holder leaves its lock directory with the holder metadata still
  // inside. Staleness reclamation must clear the tool's own metadata; a stale
  // lock that can never be reclaimed turns every later mutation into a
  // permanent bounded wait ending in a false contention report.
  it.live("C-20: a stale lock left by a crashed process is reclaimed despite holder metadata", () =>
    Effect.gen(function* () {
      const workspaceDir = path.join(tempDir, ".axm");
      const lockPath = path.join(workspaceDir, "tmp", "workspace-transition.lock");
      fs.mkdirSync(lockPath, { recursive: true });
      fs.writeFileSync(
        path.join(lockPath, "holder.json"),
        JSON.stringify({ command: "crashed", pid: 999999, token: "c".repeat(32) }),
      );
      const past = new Date(Date.now() - 120_000);
      fs.utimesSync(lockPath, past, past);
      yield* Effect.scoped(
        Effect.gen(function* () {
          const contention = yield* acquireWorkspaceTransitionLock({
            workspaceDir,
            holder: { command: "update", pid: process.pid },
            waitBoundMillis: 500,
          });
          expect(Option.isNone(contention)).toBe(true);
          const holder = JSON.parse(
            fs.readFileSync(path.join(lockPath, "holder.json"), "utf8"),
          ) as { command: string };
          expect(holder.command).toBe("update");
        }),
      );
      expect(fs.existsSync(lockPath)).toBe(false);
    }).pipe(Effect.provide(services)),
  );

  // Contention waits absorb only the lock-is-held class of errors. Anything
  // else — permissions, corrupt squatting state — is not resolved by waiting
  // and must surface as a typed failure immediately.
  it.live("C-20: a non-contention acquisition error surfaces immediately as a typed failure", () =>
    Effect.gen(function* () {
      const workspaceDir = path.join(tempDir, ".axm");
      const scratchDir = path.join(workspaceDir, "tmp");
      const lockPath = path.join(scratchDir, "workspace-transition.lock");
      fs.mkdirSync(scratchDir, { recursive: true });
      // A stale regular file squatting the lock path: reclamation cannot
      // rmdir it, and no amount of waiting resolves it.
      fs.writeFileSync(lockPath, "not a lock directory");
      const past = new Date(Date.now() - 120_000);
      fs.utimesSync(lockPath, past, past);
      const started = Date.now();
      const result = yield* Effect.result(
        Effect.scoped(
          acquireWorkspaceTransitionLock({
            workspaceDir,
            holder: { command: "update", pid: process.pid },
            waitBoundMillis: 10_000,
          }),
        ),
      );
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure._tag).toBe("AppError");
        expect(result.failure.detail).toContain("workspace transition lock");
      }
      expect(Date.now() - started).toBeLessThan(2_000);
      expect(fs.existsSync(lockPath)).toBe(true);
    }).pipe(Effect.provide(services)),
  );

  // The acquisition mask must stay narrow: a contender parked on the bounded
  // wait interrupts promptly and leaves the holder's lock untouched.
  it.live("C-20: a contender's wait is interruptible and leaves the holder's lock intact", () =>
    Effect.gen(function* () {
      const workspaceDir = path.join(tempDir, ".axm");
      const lockPath = path.join(workspaceDir, "tmp", "workspace-transition.lock");
      yield* Effect.scoped(
        Effect.gen(function* () {
          const first = yield* acquireWorkspaceTransitionLock({
            workspaceDir,
            holder: { command: "install", pid: process.pid },
          });
          expect(Option.isNone(first)).toBe(true);
          const waiting = yield* Deferred.make<void>();
          const contender = yield* Effect.forkChild(
            Effect.scoped(
              acquireWorkspaceTransitionLock({
                workspaceDir,
                holder: { command: "update", pid: process.pid },
                waitBoundMillis: 30_000,
                onWaiting: () => Deferred.succeed(waiting, void 0),
              }),
            ),
          );
          yield* Deferred.await(waiting);
          const interruptStarted = Date.now();
          yield* Fiber.interrupt(contender);
          expect(Date.now() - interruptStarted).toBeLessThan(2_000);
          const holder = JSON.parse(
            fs.readFileSync(path.join(lockPath, "holder.json"), "utf8"),
          ) as { command: string };
          expect(holder.command).toBe("install");
        }),
      );
    }).pipe(Effect.provide(services)),
  );

  it.effect("transitionLockPath names the load-bearing location", () =>
    Effect.gen(function* () {
      const pathService = yield* Path.Path;
      expect(transitionLockPath(pathService, "/ws/.axm")).toBe(
        "/ws/.axm/tmp/workspace-transition.lock",
      );
    }).pipe(Effect.provide(services)),
  );
});

/** Node services with a FileSystem whose holder.json writes always fail. */
const holderWriteFailingServices = Layer.effect(
  FileSystem.FileSystem,
  Effect.gen(function* () {
    const real = yield* FileSystem.FileSystem;
    return {
      ...real,
      writeFileString: (...args: Parameters<FileSystem.FileSystem["writeFileString"]>) =>
        args[0].endsWith("holder.json")
          ? Effect.fail(
              PlatformError.badArgument({
                module: "FileSystem",
                method: "writeFileString",
                description: "injected holder write failure",
              }),
            )
          : real.writeFileString(...args),
    };
  }),
).pipe(Layer.provideMerge(NodeServices.layer));

const acquireWorkspaceTransitionLockForTest = (
  workspaceDir: string,
  waitingReports: Array<string>,
) =>
  acquireWorkspaceTransitionLock({
    workspaceDir,
    holder: { command: "update", pid: process.pid },
    waitBoundMillis: 600,
    onWaiting: (holder) =>
      Effect.sync(() => {
        waitingReports.push(
          Option.match(holder, {
            onNone: () => "waiting: unknown holder",
            onSome: (value) => `waiting: ${value.command}`,
          }),
        );
      }),
  });
