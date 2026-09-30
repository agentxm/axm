/** Deterministically held Node processes using the published transaction/write boundaries. */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageDirectory = fileURLToPath(new URL("../../", import.meta.url));
const program = String.raw`
import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { runWorkspaceTransaction, protectWorkspacePath, recordFootprint, WorkspaceFileWriteLocks } from "@agentxm/workspace-kernel/settlement";
import { WorkspaceTransactionScopeLive, WorkspaceFileWriteLocksLive } from "@agentxm/workspace-kernel/settlement/live";
import { WorkspaceBoundaryClaimsTest } from "@agentxm/workspace-kernel/settlement/testing";
const options = JSON.parse(process.argv[1]);
const send = event => process.send?.({ event });
let release, restore;
const released = new Promise(resolve => { release = resolve; });
const restored = new Promise(resolve => { restore = resolve; });
process.on("message", message => { if (message === "release") release(); if (message === "restore") restore(); });
const settings = path.join(options.owner, "axm.json");
const result = await Effect.runPromise(runWorkspaceTransaction({
  targets: [], claimDefaultTargets: false,
  onRestorationStarted: options.holdRollback ? Effect.sync(() => send("restoring")).pipe(Effect.andThen(Effect.promise(() => restored))) : undefined,
  transition: Effect.gen(function* () {
    // An overlap discovered later must restore this earlier independent write.
    yield* protectWorkspacePath(settings);
    fs.writeFileSync(settings, "changed");
    yield* recordFootprint({ path: settings, change: "modified" });
    const locks = yield* WorkspaceFileWriteLocks;
    yield* locks.withLock(options.target, Effect.gen(function* () {
      send("read-entered");
      yield* protectWorkspacePath(options.target);
      send("claimed");
      if (options.holdBeforeWrite) yield* Effect.promise(() => released);
      fs.writeFileSync(options.file, options.label);
      yield* recordFootprint({ path: options.file, change: "modified" });
      send("written");
      if (options.hold) yield* Effect.promise(() => released);
      if (options.fail) return yield* Effect.fail("injected-after-write");
    }));
  }),
  validate: () => Effect.void,
}).pipe(
  Effect.provide(Layer.merge(WorkspaceTransactionScopeLive({
    workspaceDir: path.join(options.owner, ".axm"), settingsPath: settings,
    lockPath: path.join(options.owner, "axm-lock.yaml"), nativeRoots: [options.owner, options.nativeRoot],
  }), WorkspaceFileWriteLocksLive).pipe(options.namespace === undefined ? layer => layer : Layer.provide(WorkspaceBoundaryClaimsTest(options.namespace)))),
  Effect.provide(NodeServices.layer), Effect.result,
));
if (result._tag === "Failure") {
  if (result.failure._tag === "WorkspaceSnapshotError" && result.failure.cause?._tag === "WorkspaceBoundaryConflict") send("conflict:" + result.failure.cause.reason);
  send(result.failure._tag === "WorkspaceRestorationIncomplete" ? "retained" : "refused");
  if (result.failure._tag === "WorkspaceRestorationIncomplete" && result.failure.snapshotDir) fs.rmSync(result.failure.snapshotDir, { recursive: true, force: true });
} else send("committed");
send("closed");
process.disconnect?.();
`;

export interface BoundaryProcessOptions {
  readonly owner: string;
  readonly namespace?: string;
  readonly nativeRoot: string;
  readonly target: string;
  readonly file: string;
  readonly label: string;
  readonly hold?: boolean;
  readonly holdBeforeWrite?: boolean;
  readonly fail?: boolean;
  readonly holdRollback?: boolean;
  readonly runtime?: "node" | "bun";
}

export const startBoundaryClaimProcess = (options: BoundaryProcessOptions) => {
  const child = spawn(
    options.runtime === "bun" ? "bun" : process.execPath,
    ["--input-type=module", "--eval", program, JSON.stringify(options)],
    {
      cwd: packageDirectory,
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      // Both processes must use the shared namespace despite different captured homes/temp routes.
      env: {
        ...process.env,
        HOME: options.owner,
        AXM_USER_HOME: options.owner,
        TMPDIR: options.owner,
      },
    },
  );
  const events: string[] = [];
  const waiters = new Map<
    string,
    Array<{ readonly resolve: () => void; readonly reject: (cause: Error) => void }>
  >();
  let stderr = "";
  let ended = false;
  let failure: Error | undefined;
  const reject = (cause: Error) => {
    failure = cause;
    for (const listeners of waiters.values())
      for (const listener of listeners) listener.reject(cause);
    waiters.clear();
  };
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  child.on("error", reject);
  child.on("message", (message: unknown) => {
    if (
      typeof message !== "object" ||
      message === null ||
      !("event" in message) ||
      typeof message.event !== "string"
    )
      return reject(new Error("Invalid boundary worker event"));
    events.push(message.event);
    for (const listener of waiters.get(message.event) ?? []) listener.resolve();
    waiters.delete(message.event);
  });
  // Failure deadline only: all behavioral sequencing uses IPC handshakes.
  const deadline = setTimeout(() => {
    reject(new Error(`Boundary worker timeout: ${events.join(", ")}; ${stderr}`));
    child.kill("SIGKILL");
  }, 25000);
  const completion = new Promise<number | null>((resolve) =>
    child.on("close", (code) => {
      ended = true;
      clearTimeout(deadline);
      if (code !== 0 || waiters.size > 0)
        reject(new Error(`Boundary worker exit ${code}: ${events.join(", ")}; ${stderr}`));
      resolve(code);
    }),
  );
  return {
    events,
    completion,
    waitFor: (event: string): Promise<void> => {
      if (events.includes(event)) return Promise.resolve();
      if (failure !== undefined) return Promise.reject(failure);
      if (ended)
        return Promise.reject(
          new Error(`Worker closed before ${event}: ${events.join(", ")}; ${stderr}`),
        );
      return new Promise((resolve, reject) => {
        const listeners = waiters.get(event) ?? [];
        listeners.push({ resolve, reject });
        waiters.set(event, listeners);
      });
    },
    release: () => child.send("release"),
    restore: () => child.send("restore"),
    stop: () => {
      clearTimeout(deadline);
      if (!ended) child.kill("SIGKILL");
    },
  };
};
