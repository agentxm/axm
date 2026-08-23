import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import {
  acquireWorkspaceTransitionLock,
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

  it.effect("transitionLockPath names the load-bearing location", () =>
    Effect.gen(function* () {
      const pathService = yield* Path.Path;
      expect(transitionLockPath(pathService, "/ws/.axm")).toBe(
        "/ws/.axm/tmp/workspace-transition.lock",
      );
    }).pipe(Effect.provide(services)),
  );
});

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
