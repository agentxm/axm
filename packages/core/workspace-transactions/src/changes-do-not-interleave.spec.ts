import * as nodeFs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { acquireWorkspaceTransition } from "./scope.js";
import { runWorkspaceTransaction } from "./transaction.js";
import { startWorkspaceTransitionProcess } from "./test-support/contention-process.js";
import { makeMemoryTransitionLockWorld, WorkspaceTransactionScopeTest } from "./testing.js";

export const specification = defineSpecification({
  requirement: "cli/changes-do-not-interleave",
  title: "Concurrent changes to one workspace never interleave",
  statement:
    "When changes contend for the same workspace, AXM shall prevent one change from applying workspace writes while another is in progress and shall allow a change refused for contention to proceed when retried after the workspace becomes available.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  boundary: "process",
  boundaryRationale:
    "Separate Node processes overlap while using the published transition and transaction boundaries of @agentxm/workspace-transactions, which is where a change's write window is opened and closed.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/**
 * Two authoritative state families one change writes. A change that
 * interleaved with another would be observable as a state file that moved
 * while its mirror did not.
 */
interface Families {
  readonly state: string;
  readonly mirror: string;
}

const readFamilies = (root: string): { readonly state: unknown; readonly mirror: unknown } => ({
  state: JSON.parse(nodeFs.readFileSync(nodePath.join(root, "state.json"), "utf8")),
  mirror: JSON.parse(nodeFs.readFileSync(nodePath.join(root, "mirror.json"), "utf8")),
});

const makeContendedWorkspace = () => {
  const root = nodeFs.realpathSync(
    nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-interleave-")),
  );
  nodeFs.mkdirSync(nodePath.join(root, ".axm"), { recursive: true });
  nodeFs.writeFileSync(nodePath.join(root, "state.json"), "[]");
  nodeFs.writeFileSync(nodePath.join(root, "mirror.json"), "[]");
  const families: Families = {
    state: nodePath.join(root, "state.json"),
    mirror: nodePath.join(root, "mirror.json"),
  };
  return {
    root,
    families,
    paths: {
      workspaceDir: nodePath.join(root, ".axm"),
      settingsPath: nodePath.join(root, "axm.json"),
      lockPath: nodePath.join(root, "axm-lock.yaml"),
    },
    cleanup: () => nodeFs.rmSync(root, { recursive: true, force: true }),
  };
};

describe("Concurrent workspace changes", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "a second change never writes while the first holds the workspace, and applies when retried",
    () => {
      const workspace = makeContendedWorkspace();
      cleanups.push(workspace.cleanup);
      const world = makeMemoryTransitionLockWorld();
      const scopeFor = () =>
        WorkspaceTransactionScopeTest(workspace.paths, { lock: world.invocation() });

      /**
       * One change: open the transition, then write both state families
       * inside one transaction. `hold` lets the example stop the first change
       * mid-write, which is exactly the window the rule is about.
       */
      const change = (
        label: string,
        options?: {
          readonly hold?: Deferred.Deferred<void>;
          readonly entered?: Deferred.Deferred<void>;
          readonly waiting?: Deferred.Deferred<Option.Option<number>>;
        },
      ) => {
        const waiting = options?.waiting;
        return Effect.scoped(
          Effect.gen(function* () {
            const contention = yield* acquireWorkspaceTransition({
              command: label,
              ...(waiting === undefined
                ? {}
                : {
                    onWaiting: (holder) =>
                      Deferred.succeed(
                        waiting,
                        Option.map(holder, (value) => value.pid),
                      ).pipe(Effect.asVoid),
                  }),
            });
            if (Option.isSome(contention)) return { label, outcome: "refused" as const };
            return yield* runWorkspaceTransaction({
              claimDefaultTargets: false,
              targets: [workspace.families.state, workspace.families.mirror],
              transition: Effect.gen(function* () {
                const prior: ReadonlyArray<string> = JSON.parse(
                  nodeFs.readFileSync(workspace.families.state, "utf8"),
                );
                const next = [...prior, label];
                nodeFs.writeFileSync(workspace.families.state, JSON.stringify(next));
                if (options?.entered !== undefined)
                  yield* Deferred.succeed(options.entered, undefined);
                if (options?.hold !== undefined) yield* Deferred.await(options.hold);
                nodeFs.writeFileSync(workspace.families.mirror, JSON.stringify(next));
                return { label, outcome: "applied" as const };
              }),
              validate: () =>
                Effect.sync(() => {
                  const observed = readFamilies(workspace.root);
                  expect(observed.state).toEqual(observed.mirror);
                }),
            });
          }),
        ).pipe(Effect.provide(scopeFor()));
      };

      return Effect.gen(function* () {
        // The TestClock schedules its own "not advancing the clock" warning on
        // the live clock. This example drives the clock itself, so retire that
        // warning before anything sleeps.
        yield* TestClock.adjust("0 millis");

        // Contention waits on the clock, so a driver fiber keeps advancing it
        // until the race settles. It is unbounded so real filesystem latency
        // never starves the race of clock progress.
        const driver = yield* Effect.forkChild(
          Effect.forever(
            Effect.gen(function* () {
              yield* Effect.yieldNow;
              yield* TestClock.adjust("250 millis");
            }),
          ),
        );

        const entered = yield* Deferred.make<void>();
        const hold = yield* Deferred.make<void>();
        const waiting = yield* Deferred.make<Option.Option<number>>();

        const first = yield* Effect.forkChild(change("first", { entered, hold }));
        yield* Deferred.await(entered);

        // The first change has written one family and not the other. A second
        // change started now must not enter: it waits, and while it waits the
        // partly-written state is not disturbed.
        const partial = readFamilies(workspace.root);
        expect(partial.state).toEqual(["first"]);
        expect(partial.mirror).toEqual([]);

        const second = yield* Effect.forkChild(change("second", { waiting }));
        const holder = yield* Deferred.await(waiting);
        expect(Option.isSome(holder)).toBe(true);
        expect(readFamilies(workspace.root)).toEqual(partial);

        // Past the production contention bound the second change is refused
        // outright — it never applied a workspace write.
        const refused = yield* Fiber.join(second);
        expect(refused).toEqual({ label: "second", outcome: "refused" });
        expect(readFamilies(workspace.root)).toEqual(partial);

        // The first change completes, both of its families land together.
        yield* Deferred.succeed(hold, undefined);
        expect(yield* Fiber.join(first)).toEqual({ label: "first", outcome: "applied" });
        expect(readFamilies(workspace.root)).toEqual({ state: ["first"], mirror: ["first"] });

        // A change refused for contention was serialized out, not lost:
        // retried after the workspace became available, it applies on top of
        // the winner without disturbing it.
        expect(yield* change("second")).toEqual({ label: "second", outcome: "applied" });
        expect(readFamilies(workspace.root)).toEqual({
          state: ["first", "second"],
          mirror: ["first", "second"],
        });
        expect(nodeFs.existsSync(nodePath.join(workspace.root, ".axm", "tmp"))).toBe(false);
        yield* Fiber.interrupt(driver);
      }).pipe(Effect.provide(Layer.fresh(NodeServices.layer)));
    },
    30000,
  );
});

describe("Workspace changes in separate processes", () => {
  it("does not enter a second transition while the first process holds an incomplete change", async () => {
    const root = nodeFs.realpathSync(
      nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-process-contention-")),
    );
    nodeFs.writeFileSync(nodePath.join(root, "state.json"), "[]");
    nodeFs.writeFileSync(nodePath.join(root, "mirror.json"), "[]");
    nodeFs.writeFileSync(nodePath.join(root, "trace.jsonl"), "");
    const first = startWorkspaceTransitionProcess(root, "first");
    let second: ReturnType<typeof startWorkspaceTransitionProcess> | undefined;
    try {
      const entered = await first.waitFor("entered");
      second = startWorkspaceTransitionProcess(root, "second");
      const waiting = await second.waitFor("waiting");
      expect(waiting.pid).not.toBe(entered.pid);
      expect(waiting.holderPid).toBe(entered.pid);
      expect(first.events.some((event) => event.event === "released")).toBe(false);
      expect(second.events.some((event) => event.event === "entered")).toBe(false);
      expect(JSON.parse(nodeFs.readFileSync(nodePath.join(root, "state.json"), "utf8"))).toEqual([
        "first",
      ]);
      expect(JSON.parse(nodeFs.readFileSync(nodePath.join(root, "mirror.json"), "utf8"))).toEqual(
        [],
      );
      const traceBefore = nodeFs
        .readFileSync(nodePath.join(root, "trace.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line): unknown => JSON.parse(line));
      expect(traceBefore).toEqual([{ label: "first", event: "entered", pid: entered.pid }]);

      first.release();
      await first.waitFor("released");
      const secondEntered = await second.waitFor("entered");
      expect(await first.completion).toBe(0);
      expect(await second.completion).toBe(0);
      const trace = nodeFs
        .readFileSync(nodePath.join(root, "trace.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line): unknown => JSON.parse(line));
      expect(trace).toEqual([
        { label: "first", event: "entered", pid: entered.pid },
        { label: "first", event: "complete", pid: entered.pid },
        { label: "second", event: "entered", pid: secondEntered.pid },
        { label: "second", event: "complete", pid: secondEntered.pid },
      ]);
      for (const file of ["state.json", "mirror.json"])
        expect(JSON.parse(nodeFs.readFileSync(nodePath.join(root, file), "utf8"))).toEqual([
          "first",
          "second",
        ]);
    } finally {
      first.stop();
      second?.stop();
      await first.completion;
      if (second !== undefined) await second.completion;
      nodeFs.rmSync(root, { recursive: true, force: true });
    }
  }, 30000);
});
