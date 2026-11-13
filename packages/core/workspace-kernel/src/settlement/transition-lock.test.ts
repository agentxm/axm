import { NativePlatformTest, withDetailedWork } from "../locations/testing.js";
import * as fs from "node:fs";
import { execFileSync } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Tracer from "effect/Tracer";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";

import { makeWorkspaceTransitionLock, transitionLockPath } from "./transition-lock.js";

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-transition-lock-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const services = NativePlatformTest;

describe("workspace transition lock", () => {
  it.effect("C-20: holds, records the holder, and releases with its scope", () =>
    Effect.gen(function* () {
      const spans: Tracer.NativeSpan[] = [];
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      const workspaceDir = path.join(tempDir, ".axm");
      const lock = yield* makeWorkspaceTransitionLock;
      const lockPath = path.join(workspaceDir, "tmp", "workspace-transition.lock");
      yield* Effect.scoped(
        Effect.gen(function* () {
          const contention = yield* lock.acquire({
            workspaceDir,
            holder: { command: "update", pid: process.pid },
          });
          expect(Option.isNone(contention)).toBe(true);
          expect(fs.existsSync(lockPath)).toBe(true);
          expect(Option.isSome(yield* lock.held(path.resolve(workspaceDir)))).toBe(true);
          const holder = JSON.parse(
            fs.readFileSync(path.join(lockPath, "holder.json"), "utf8"),
          ) as { command: string; pid: number };
          expect(holder.command).toBe("update");
        }),
      ).pipe(withDetailedWork(tracer));
      const native = spans.filter(
        (span) => span.name.startsWith("axm.native.lock-") && span.name !== "axm.native.lock-io",
      );
      expect(native.map((span) => span.name)).toEqual([
        "axm.native.lock-acquire",
        "axm.native.lock-release",
      ]);
      expect(native.every((span) => span.status._tag === "Ended")).toBe(true);
      expect(native.map((span) => span.attributes.get("axm.work.executed"))).toEqual([1, 1]);
      expect(spans.filter((span) => span.name === "axm.wait.workspace-lock")).toHaveLength(0);
      expect(fs.existsSync(lockPath)).toBe(false);
      expect(Option.isSome(yield* lock.held(path.resolve(workspaceDir)))).toBe(false);
      const calls = spans.filter((span) => span.name === "axm.native.lock-io");
      expect(calls.every((span) => span.status._tag === "Ended")).toBe(true);
      expect(calls.every((span) => span.attributes.get("axm.work.executed") === 1)).toBe(true);
      expect(
        calls
          .filter((span) => span.attributes.get("axm.native.phase") === "release")
          .map((span) => span.attributes.get("axm.native.operation")),
      ).toEqual(["unlink", "rmdir"]);
      expect(
        calls
          .filter((span) => span.attributes.get("axm.native.operation") === "write-file")
          .map((span) => span.attributes.get("axm.work.bytes")),
      ).toEqual([0]);
      expect(
        calls
          .filter((span) => span.attributes.get("axm.native.operation") !== "write-file")
          .every((span) => span.attributes.get("axm.work.bytes") === undefined),
      ).toBe(true);
      expect(
        calls.every((span) =>
          Option.exists(span.parent, (parent) =>
            native.some((owner) => owner.spanId === parent.spanId),
          ),
        ),
      ).toBe(true);

      // The wrapper must share proper-lockfile's private precision cache: another
      // acquisition creates its placeholder but must not add another utimes probe.
      spans.length = 0;
      yield* Effect.scoped(
        lock.acquire({ workspaceDir, holder: { command: "again", pid: process.pid } }),
      ).pipe(withDetailedWork(tracer));
      expect(
        spans
          .filter(
            (span) =>
              span.name === "axm.native.lock-io" &&
              span.attributes.get("axm.native.phase") === "acquire",
          )
          .map((span) => span.attributes.get("axm.native.operation")),
      ).toEqual(["mkdir", "write-file", "stat"]);
      expect(fs.existsSync(lockPath)).toBe(false);
    }).pipe(Effect.provide(services)),
  );

  for (const outcome of ["released", "interrupted"] as const) {
    it.live(`attributes one complete blocked lock interval when the contender is ${outcome}`, () =>
      Effect.gen(function* () {
        const workspaceDir = path.join(tempDir, ".axm");
        const lockPath = path.join(workspaceDir, "tmp", "workspace-transition.lock");
        const holding = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const waiting = yield* Deferred.make<void>();
        const ownerLock = yield* makeWorkspaceTransitionLock;
        const contenderLock = yield* makeWorkspaceTransitionLock;
        const owner = yield* Effect.scoped(
          ownerLock.acquire({ workspaceDir, holder: { command: "owner", pid: process.pid } }).pipe(
            Effect.tap((result) => Effect.sync(() => expect(Option.isNone(result)).toBe(true))),
            Effect.andThen(Deferred.succeed(holding, undefined)),
            Effect.andThen(Deferred.await(release)),
          ),
        ).pipe(Effect.forkChild);
        yield* Deferred.await(holding);
        const spans: Tracer.NativeSpan[] = [];
        const tracer = Tracer.make({
          span(options) {
            const span = new Tracer.NativeSpan(options);
            spans.push(span);
            return span;
          },
        });
        const contender = yield* Effect.scoped(
          contenderLock.acquire({
            workspaceDir,
            holder: { command: "contender", pid: process.pid },
            onWaiting: () => Deferred.succeed(waiting, undefined).pipe(Effect.asVoid),
          }),
        ).pipe(withDetailedWork(tracer), Effect.forkChild);
        yield* Effect.gen(function* () {
          yield* Deferred.await(waiting);
          const wait = spans.find((span) => span.name === "axm.wait.workspace-lock");
          expect(wait?.status._tag).toBe("Started");
          expect(fs.existsSync(lockPath)).toBe(true);
          if (outcome === "released") {
            yield* Deferred.succeed(release, undefined);
            yield* Fiber.join(owner);
            expect(Option.isNone(yield* Fiber.join(contender))).toBe(true);
            expect(wait?.attributes.get("axm.wait.outcome")).toBe("acquired");
            expect(wait?.attributes.get("axm.wait.attempts")).toBeGreaterThanOrEqual(2);
          } else {
            yield* Fiber.interrupt(contender);
            expect(wait?.attributes.get("axm.wait.outcome")).toBe("interrupted");
            expect(wait?.status._tag === "Ended" && wait.status.exit._tag).toBe("Failure");
            // Cancellation must leave the unrelated holder's lock intact.
            expect(fs.existsSync(lockPath)).toBe(true);
            yield* Deferred.succeed(release, undefined);
            yield* Fiber.join(owner);
          }
          expect(spans.filter((span) => span.name === "axm.wait.workspace-lock")).toHaveLength(1);
          expect(wait?.status._tag).toBe("Ended");
          expect(fs.existsSync(lockPath)).toBe(false);
        }).pipe(Effect.ensuring(Deferred.succeed(release, undefined)));
      }).pipe(Effect.scoped, Effect.provide(services)),
    );
  }

  it.live.each([true, false])(
    "C-20: holder metadata preserves ownership through the first refresh (tracing=%s)",
    (tracing) =>
      Effect.gen(function* () {
        const spans: Tracer.NativeSpan[] = [];
        const tracer = Tracer.make({
          span(options) {
            const span = new Tracer.NativeSpan(options);
            spans.push(span);
            return span;
          },
        });
        const workspaceDir = path.join(tempDir, ".axm");
        const lockPath = path.join(workspaceDir, "tmp", "workspace-transition.lock");
        const lock = yield* makeWorkspaceTransitionLock;
        yield* Effect.scoped(
          Effect.gen(function* () {
            const contention = yield* lock.acquire({
              workspaceDir,
              holder: { command: "install", pid: process.pid },
              timingMillis: { stale: 2000, update: 1000 },
            });
            expect(Option.isNone(contention)).toBe(true);
            const held = Option.getOrUndefined(yield* lock.held(path.resolve(workspaceDir)));
            expect(held).toBeDefined();
            const holder = fs.readFileSync(path.join(lockPath, "holder.json"), "utf8");
            const acquiredMtime = fs.statSync(lockPath).mtimeMs;
            // Poll only the independent host oracle; product heartbeat timing is unchanged.
            yield* Effect.gen(function* () {
              while (fs.statSync(lockPath).mtimeMs === acquiredMtime) {
                yield* Effect.sleep("25 millis");
              }
            }).pipe(Effect.timeout("4 seconds"));
            expect(fs.readFileSync(path.join(lockPath, "holder.json"), "utf8")).toBe(holder);
            if (held?.isCompromised()) return yield* held.compromised;
          }),
        ).pipe(withDetailedWork(tracer), Effect.withTracerEnabled(tracing));
        expect(fs.existsSync(lockPath)).toBe(false);
        const heartbeat = spans.filter(
          (span) =>
            span.name === "axm.native.lock-io" &&
            span.attributes.get("axm.native.phase") === "heartbeat",
        );
        if (tracing) {
          expect(heartbeat.map((span) => span.attributes.get("axm.native.operation"))).toEqual([
            "stat",
            "utimes",
          ]);
          expect(
            heartbeat.every(
              (span) => span.status._tag === "Ended" && span.status.exit._tag === "Success",
            ),
          ).toBe(true);
          expect(heartbeat.every((span) => span.attributes.get("axm.work.executed") === 1)).toBe(
            true,
          );
          const acquired = spans.find((span) => span.name === "axm.native.lock-acquire");
          expect(
            heartbeat.every(
              (span) => Option.isSome(span.parent) && span.parent.value.spanId === acquired?.spanId,
            ),
          ).toBe(true);
        } else {
          expect(spans).toEqual([]);
        }
      }).pipe(Effect.provide(services)),
    { timeout: 7000 },
  );

  it.effect("records synchronous native cleanup when a process exits while holding the lock", () =>
    Effect.sync(() => {
      const workspaceDir = path.join(tempDir, ".axm");
      const evidence = path.join(tempDir, "native-exit.txt");
      const program = `
import * as fs from "node:fs";
import * as Effect from "effect/Effect";
import * as Tracer from "effect/Tracer";
const { makeWorkspaceTransitionLock } = await import(process.argv[1]);
const { NativePlatformTest } = await import(process.argv[2]);
const { CurrentWorkObserver } = await import(process.argv[5]);
const tracer = Tracer.make({ span(options) {
  const span = new Tracer.NativeSpan(options);
  const end = span.end.bind(span);
  span.end = (time, exit) => {
    end(time, exit);
    if (span.name === "axm.native.lock-io" && span.attributes.get("axm.native.phase") === "exit") {
      fs.appendFileSync(process.argv[4], [span.attributes.get("axm.native.operation"), span.attributes.get("axm.work.executed"), String(span.attributes.get("axm.work.bytes")), exit._tag].join(":") + "\\n");
    }
  };
  return span;
} });
await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const lock = yield* makeWorkspaceTransitionLock;
  yield* lock.acquire({ workspaceDir: process.argv[3], holder: { command: "exit-probe", pid: process.pid } });
  process.exit(0);
})).pipe(Effect.provide(NativePlatformTest), Effect.withTracer(tracer), Effect.provideService(CurrentWorkObserver, { record() {}, detailSelected() { return true; } })));
`;
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          program,
          new URL("../../dist/src/settlement/transition-lock.js", import.meta.url).href,
          new URL("../../dist/src/locations/testing.js", import.meta.url).href,
          workspaceDir,
          evidence,
          new URL(
            "../../../../generic/host-primitives/dist/src/work-observation.js",
            import.meta.url,
          ).href,
        ],
        { cwd: process.cwd(), env: process.env, timeout: 10000, stdio: "pipe" },
      );
      expect(fs.existsSync(path.join(workspaceDir, "tmp", "workspace-transition.lock"))).toBe(
        false,
      );
      // This synchronous test tracer proves the callback lifetime; it does not
      // claim an asynchronous OTLP exporter can drain after process.exit.
      expect(fs.readFileSync(evidence, "utf8").trim().split("\n")).toEqual([
        "unlink:1:undefined:Success",
        "rmdir:1:undefined:Success",
      ]);
    }),
  );

  it.live(
    "C-20: a contender waits with a visible reason and times out with the holder reference",
    () =>
      Effect.gen(function* () {
        const workspaceDir = path.join(tempDir, ".axm");
        const lock = yield* makeWorkspaceTransitionLock;
        const waitingReports: Array<string> = [];
        yield* Effect.scoped(
          Effect.gen(function* () {
            const first = yield* lock.acquire({
              workspaceDir,
              holder: { command: "install", pid: 1234 },
            });
            expect(Option.isNone(first)).toBe(true);
            // Simulate a second process: this invocation's own hold must not
            // short-circuit the contender, so clear the in-process marker the
            // way a separate process would never have set it.
            const spans: Tracer.NativeSpan[] = [];
            const tracer = Tracer.make({
              span(options) {
                const span = new Tracer.NativeSpan(options);
                spans.push(span);
                return span;
              },
            });
            const contention = yield* Effect.scoped(
              acquireWorkspaceTransitionLockForTest(workspaceDir, waitingReports),
            ).pipe(withDetailedWork(tracer));
            const waits = spans.filter((span) => span.name === "axm.wait.workspace-lock");
            expect(waits).toHaveLength(1);
            expect(waits.every((span) => span.status._tag === "Ended")).toBe(true);
            expect(waits[0]?.attributes.get("axm.wait.outcome")).toBe("timed-out");
            expect(waits[0]?.attributes.get("axm.wait.attempts")).toBe(4);
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

  for (const placeholder of ["", '{"command":'] as const) {
    it.effect(
      `an unstamped holder with ${placeholder === "" ? "empty" : "partial"} metadata remains contended and unknown`,
      () =>
        Effect.gen(function* () {
          const real = yield* FileSystem.FileSystem;
          const workspaceDir = path.join(tempDir, ".axm");
          const lockPath = path.join(workspaceDir, "tmp", "workspace-transition.lock");
          const holderPath = path.join(lockPath, "holder.json");
          const stamping = yield* Deferred.make<void>();
          const stamp = yield* Deferred.make<void>();
          const acquired = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          const ownerLock = yield* makeWorkspaceTransitionLock;
          const contenderLock = yield* makeWorkspaceTransitionLock;
          const owner = yield* Effect.scoped(
            ownerLock
              .acquire({
                workspaceDir,
                holder: { command: "owner", pid: process.pid },
              })
              .pipe(
                Effect.andThen(Deferred.succeed(acquired, undefined)),
                Effect.andThen(Deferred.await(release)),
                Effect.provideService(FileSystem.FileSystem, {
                  ...real,
                  writeFileString: (target, data, options) =>
                    Effect.gen(function* () {
                      if (target === holderPath) {
                        // Pause between the library's grant/empty placeholder and AXM's stamp.
                        if (placeholder !== "") yield* real.writeFileString(target, placeholder);
                        yield* Deferred.succeed(stamping, undefined);
                        yield* Deferred.await(stamp);
                      }
                      return yield* real.writeFileString(target, data, options);
                    }),
                }),
              ),
          ).pipe(Effect.forkChild);
          yield* Effect.gen(function* () {
            yield* Deferred.await(stamping);
            expect(yield* real.readFileString(holderPath)).toBe(placeholder);
            const result = yield* Effect.scoped(
              contenderLock.acquire({
                workspaceDir,
                holder: { command: "contender", pid: process.pid },
                waitBoundMillis: 0,
              }),
            ).pipe(Effect.exit);
            const retained = yield* real.readFileString(holderPath);
            yield* Deferred.succeed(stamp, undefined);
            yield* Deferred.await(acquired);
            const stamped = yield* Effect.scoped(
              contenderLock.acquire({
                workspaceDir,
                holder: { command: "contender", pid: process.pid },
                waitBoundMillis: 0,
              }),
            );
            yield* Deferred.succeed(release, undefined);
            yield* Fiber.join(owner);
            expect(Exit.isSuccess(result)).toBe(true);
            if (Exit.isSuccess(result)) {
              expect(Option.isSome(result.value)).toBe(true);
              if (Option.isSome(result.value))
                expect(Option.isNone(result.value.value.holder)).toBe(true);
            }
            expect(retained).toBe(placeholder);
            expect(Option.isSome(stamped)).toBe(true);
            if (Option.isSome(stamped))
              expect(Option.getOrUndefined(stamped.value.holder)?.command).toBe("owner");
            expect(fs.existsSync(lockPath)).toBe(false);
            yield* Effect.scoped(
              contenderLock
                .acquire({
                  workspaceDir,
                  holder: { command: "retry", pid: process.pid },
                  waitBoundMillis: 0,
                })
                .pipe(
                  Effect.tap((value) => Effect.sync(() => expect(Option.isNone(value)).toBe(true))),
                ),
            );
          }).pipe(
            Effect.ensuring(
              Deferred.succeed(stamp, undefined).pipe(
                Effect.andThen(Deferred.succeed(release, undefined)),
              ),
            ),
          );
        }).pipe(Effect.scoped, Effect.provide(services)),
    );
  }

  // Residual cleanup requires an exact owner-token match: absent metadata is
  // indistinguishable from a successor that reclaimed the stale hold but has
  // not yet written its holder file.
  it.effect(
    "C-20: release never removes another invocation's lock left without holder metadata",
    () =>
      Effect.gen(function* () {
        const workspaceDir = path.join(tempDir, ".axm");
        const lock = yield* makeWorkspaceTransitionLock;
        const lockPath = path.join(workspaceDir, "tmp", "workspace-transition.lock");
        yield* Effect.scoped(
          Effect.gen(function* () {
            const contention = yield* lock.acquire({
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
      const lock = yield* makeWorkspaceTransitionLock;
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
          const contention = yield* lock.acquire({
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
  it.live.each(["owner", "successor"] as const)(
    "C-20: compromise fails the held signal and release preserves ownership (%s)",
    (remainingOwner) =>
      Effect.gen(function* () {
        const spans: Tracer.NativeSpan[] = [];
        const tracer = Tracer.make({
          span(options) {
            const span = new Tracer.NativeSpan(options);
            spans.push(span);
            return span;
          },
        });
        const workspaceDir = path.join(tempDir, ".axm");
        const lock = yield* makeWorkspaceTransitionLock;
        const lockPath = path.join(workspaceDir, "tmp", "workspace-transition.lock");
        yield* Effect.scoped(
          Effect.gen(function* () {
            const contention = yield* lock.acquire({
              workspaceDir,
              holder: { command: "update", pid: process.pid },
              timingMillis: { stale: 2000, update: 1000 },
            });
            expect(Option.isNone(contention)).toBe(true);
            const held = Option.getOrUndefined(yield* lock.held(path.resolve(workspaceDir)));
            expect(held).toBeDefined();
            if (held === undefined) return;
            expect(held.isCompromised()).toBe(false);
            // A successor reclaims the stale hold and stamps its own holder.
            // The recreated directory carries a distinct mtime, as any real
            // reclaim after the staleness window would.
            if (remainingOwner === "successor") {
              fs.rmSync(lockPath, { recursive: true, force: true });
              fs.mkdirSync(lockPath, { recursive: true });
              fs.writeFileSync(
                path.join(lockPath, "holder.json"),
                JSON.stringify({ command: "successor", pid: 4321, token: "s".repeat(32) }),
              );
            }
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
        ).pipe(withDetailedWork(tracer));
        const cleanup = spans.filter((span) => span.name === "axm.native.lock-cleanup");
        const cleanupCalls = spans.filter(
          (span) =>
            span.name === "axm.native.lock-io" &&
            span.attributes.get("axm.native.phase") === "cleanup",
        );
        expect(cleanupCalls.map((span) => span.attributes.get("axm.native.operation"))).toEqual(
          remainingOwner === "owner" ? ["unlink", "rmdir"] : [],
        );
        expect(
          cleanupCalls.every(
            (span) => span.status._tag === "Ended" && span.status.exit._tag === "Success",
          ),
        ).toBe(true);
        if (remainingOwner === "owner") {
          expect(fs.existsSync(lockPath)).toBe(false);
          expect(cleanup).toHaveLength(1);
          expect(cleanup[0]?.attributes.get("axm.work.executed")).toBe(1);
          expect(cleanup[0]?.status._tag === "Ended" && cleanup[0].status.exit._tag).toBe(
            "Success",
          );
        } else {
          const residual = JSON.parse(
            fs.readFileSync(path.join(lockPath, "holder.json"), "utf8"),
          ) as {
            command: string;
          };
          expect(residual.command).toBe("successor");
          expect(cleanup).toHaveLength(0);
        }
      }).pipe(Effect.provide(services)),
  );

  // Holder metadata is the only ownership evidence an acquisition has.
  // Failing to record it must fail the acquisition safely: release the hold
  // rather than hold anonymously, leaving nothing for a contender to wait on.
  it.effect("C-20: a failed holder write releases the acquisition and fails typed", () =>
    Effect.gen(function* () {
      const workspaceDir = path.join(tempDir, ".axm");
      const lock = yield* makeWorkspaceTransitionLock;
      const lockPath = path.join(workspaceDir, "tmp", "workspace-transition.lock");
      const failure = yield* Effect.scoped(
        lock.acquire({
          workspaceDir,
          holder: { command: "update", pid: process.pid },
        }),
      ).pipe(Effect.flip);
      expect(failure._tag).toBe("TransitionLockError");
      if (failure._tag === "TransitionLockError") {
        expect(failure.step).toBe("record-holder");
        expect(failure.path).toBe(lockPath);
      }
      expect(fs.existsSync(lockPath)).toBe(false);
      expect(Option.isSome(yield* lock.held(path.resolve(workspaceDir)))).toBe(false);
    }).pipe(Effect.provide(holderWriteFailingServices)),
  );

  // The gap between the lock library granting the hold and the release
  // finalizer registering must not be interruptible: an interrupt landing
  // there would leave a lock nobody releases until staleness.
  it.live("C-20: interruption during acquisition never leaks the lock", () =>
    Effect.gen(function* () {
      const workspaceDir = path.join(tempDir, ".axm");
      const lock = yield* makeWorkspaceTransitionLock;
      const lockPath = path.join(workspaceDir, "tmp", "workspace-transition.lock");
      const reachedHolderWrite = yield* Deferred.make<void>();
      const finishHolderWrite = yield* Deferred.make<void>();
      // Hold the native write until interruption has been requested.
      const gatedServices = Layer.effect(
        FileSystem.FileSystem,
        Effect.gen(function* () {
          const real = yield* FileSystem.FileSystem;
          return {
            ...real,
            writeFileString: (...args: Parameters<FileSystem.FileSystem["writeFileString"]>) =>
              args[0].endsWith("holder.json")
                ? Deferred.succeed(reachedHolderWrite, void 0).pipe(
                    Effect.andThen(Deferred.await(finishHolderWrite)),
                    Effect.andThen(real.writeFileString(...args)),
                  )
                : real.writeFileString(...args),
          };
        }),
      ).pipe(Layer.provideMerge(NativePlatformTest));
      const fiber = yield* Effect.forkChild(
        Effect.scoped(
          lock
            .acquire({
              workspaceDir,
              holder: { command: "update", pid: process.pid },
            })
            .pipe(Effect.andThen(Effect.never)),
        ).pipe(Effect.provide(gatedServices)),
      );
      yield* Deferred.await(reachedHolderWrite);
      const interrupting = yield* Effect.forkChild(Fiber.interrupt(fiber), {
        startImmediately: true,
      });
      yield* Deferred.succeed(finishHolderWrite, undefined);
      yield* Fiber.join(interrupting);
      expect(Exit.hasInterrupts(yield* Fiber.await(fiber))).toBe(true);
      expect(fs.existsSync(lockPath)).toBe(false);
      expect(Option.isSome(yield* lock.held(path.resolve(workspaceDir)))).toBe(false);
    }).pipe(Effect.provide(services)),
  );

  // A crashed holder leaves its lock directory with the holder metadata still
  // inside. Staleness reclamation must clear the tool's own metadata; a stale
  // lock that can never be reclaimed turns every later mutation into a
  // permanent bounded wait ending in a false contention report.
  it.live("C-20: a stale lock left by a crashed process is reclaimed despite holder metadata", () =>
    Effect.gen(function* () {
      const workspaceDir = path.join(tempDir, ".axm");
      const lock = yield* makeWorkspaceTransitionLock;
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
          const contention = yield* lock.acquire({
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
      const lock = yield* makeWorkspaceTransitionLock;
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
          lock.acquire({
            workspaceDir,
            holder: { command: "update", pid: process.pid },
            waitBoundMillis: 10_000,
          }),
        ),
      );
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure._tag).toBe("TransitionLockError");
        if (result.failure._tag === "TransitionLockError") {
          expect(result.failure.step).toBe("acquire");
          expect(result.failure.path).toBe(lockPath);
        }
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
      const lock = yield* makeWorkspaceTransitionLock;
      const lockPath = path.join(workspaceDir, "tmp", "workspace-transition.lock");
      yield* Effect.scoped(
        Effect.gen(function* () {
          const first = yield* lock.acquire({
            workspaceDir,
            holder: { command: "install", pid: process.pid },
          });
          expect(Option.isNone(first)).toBe(true);
          const waiting = yield* Deferred.make<void>();
          const contender = yield* Effect.forkChild(
            Effect.scoped(
              lock.acquire({
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
).pipe(Layer.provideMerge(NativePlatformTest));

/** A contender with its own lock instance, as a separate process would have. */
const acquireWorkspaceTransitionLockForTest = (
  workspaceDir: string,
  waitingReports: Array<string>,
) =>
  Effect.flatMap(makeWorkspaceTransitionLock, (contender) =>
    contender.acquire({
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
    }),
  );
