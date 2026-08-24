import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
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
      const residual = JSON.parse(
        fs.readFileSync(path.join(lockPath, "holder.json"), "utf8"),
      ) as { command: string };
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
