/** Separate Node processes over the published production lock and transaction boundary. */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = fileURLToPath(
  new URL("../../packages/workspace-operations/", import.meta.url),
);

// JavaScript evaluated by Node imports only published package exports. It is
// test orchestration, not an alternative CLI or an unshipped product entrypoint.
const workerProgram = String.raw`
import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Semaphore from "effect/Semaphore";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { acquireWorkspaceTransitionLock, runWorkspaceTransaction } from "@agentxm/workspace-operations";
const [root, label] = process.argv.slice(1);
if (root === undefined || (label !== "first" && label !== "second")) throw new Error("Invalid worker inputs");
const statePath = path.join(root, "state.json");
const mirrorPath = path.join(root, "mirror.json");
const tracePath = path.join(root, "trace.jsonl");
const send = (event, holderPid) => process.send?.({ event, pid: process.pid, ...(holderPid === undefined ? {} : { holderPid }) });
const trace = event => fs.appendFileSync(tracePath, JSON.stringify({ label, event, pid: process.pid }) + "\n");
let release;
const released = new Promise(resolve => { release = resolve; });
process.on("message", message => { if (message === "release") { send("release-received"); release(); } });
await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  yield* Effect.addFinalizer(() => Effect.sync(() => send("scope-closed")));
  send("acquiring");
  const contention = yield* acquireWorkspaceTransitionLock({
    workspaceDir: path.join(root, ".axm"),
    holder: { command: label, pid: process.pid },
    onWaiting: holder => Effect.sync(() => send("waiting", Option.isSome(holder) ? holder.value.pid : undefined)),
  });
  if (Option.isSome(contention)) throw new Error("The controlled holder was not released before the production contention bound");
  send("acquired");
  yield* Effect.addFinalizer(() => Effect.sync(() => send("scope-closing")));
  const semaphore = yield* Semaphore.make(1);
  yield* runWorkspaceTransaction({
    workspaceDir: path.join(root, ".axm"),
    semaphore,
    targets: [statePath, mirrorPath],
    transition: Effect.gen(function* () {
      const prior = JSON.parse(fs.readFileSync(statePath, "utf8"));
      const mirror = JSON.parse(fs.readFileSync(mirrorPath, "utf8"));
      if (JSON.stringify(prior) !== JSON.stringify(mirror)) throw new Error("Entered while another transition was only partly applied");
      const expected = label === "first" ? [] : ["first"];
      if (JSON.stringify(prior) !== JSON.stringify(expected)) throw new Error("Unexpected predecessor state");
      const next = [...prior, label];
      fs.writeFileSync(statePath, JSON.stringify(next));
      trace("entered");
      send("entered");
      if (label === "first") yield* Effect.promise(() => released);
      fs.writeFileSync(mirrorPath, JSON.stringify(next));
      return next;
    }),
    validate: expected => Effect.sync(() => {
      for (const target of [statePath, mirrorPath]) {
        if (fs.readFileSync(target, "utf8") !== JSON.stringify(expected)) throw new Error("Incomplete transaction postcondition");
      }
      trace("complete");
    }),
  });
  send("transaction-finished");
})).pipe(Effect.provide(NodeServices.layer)));
send("released");
process.disconnect?.();
`;

interface WorkerEvent {
  readonly event: string;
  readonly pid: number;
  readonly holderPid?: number;
}
const workerEvent = (value: unknown): WorkerEvent => {
  if (
    typeof value !== "object" ||
    value === null ||
    !("event" in value) ||
    typeof value.event !== "string" ||
    !("pid" in value) ||
    typeof value.pid !== "number"
  )
    throw new Error("Invalid contention worker event");
  return {
    event: value.event,
    pid: value.pid,
    ...("holderPid" in value && typeof value.holderPid === "number"
      ? { holderPid: value.holderPid }
      : {}),
  };
};
interface Waiter {
  readonly resolve: (event: WorkerEvent) => void;
  readonly reject: (error: Error) => void;
}

export const startWorkspaceTransitionProcess = (root: string, label: "first" | "second") => {
  const child = spawn(
    process.execPath,
    ["--input-type=module", "--eval", workerProgram, root, label],
    {
      cwd: packageDirectory,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  const events: Array<WorkerEvent> = [];
  const waiters = new Map<string, Array<Waiter>>();
  let errorOutput = "";
  let closed = false;
  let failure: Error | undefined;
  const diagnostic = (message: string) => {
    const observations = Object.fromEntries(
      [
        "state.json",
        "mirror.json",
        "trace.jsonl",
        ".axm/tmp/workspace-transition.lock/holder.json",
      ].map((file) => {
        const target = path.join(root, file);
        try {
          return [file, fs.readFileSync(target, "utf8")];
        } catch (error) {
          return [file, `unavailable: ${error instanceof Error ? error.message : String(error)}`];
        }
      }),
    );
    return new Error(
      `${message}; events=${JSON.stringify(events)}; waiting=${JSON.stringify([...waiters.keys()])}; files=${JSON.stringify(observations)}; stderr=${errorOutput}`,
    );
  };
  child.stderr?.on("data", (chunk: Buffer) => {
    errorOutput += chunk.toString();
  });
  child.stdout?.resume();
  const rejectWaiting = (error: Error) => {
    failure = error;
    for (const listeners of waiters.values())
      for (const listener of listeners) listener.reject(error);
    waiters.clear();
  };
  child.on("message", (message: unknown) => {
    try {
      const event = workerEvent(message);
      events.push(event);
      for (const listener of waiters.get(event.event) ?? []) listener.resolve(event);
      waiters.delete(event.event);
    } catch (error) {
      rejectWaiting(error instanceof Error ? error : new Error(String(error)));
    }
  });
  child.on("error", rejectWaiting);
  // Failure/cleanup deadline only; no elapsed-time bound establishes behavior.
  const deadline = setTimeout(() => {
    rejectWaiting(diagnostic(`Contention worker ${label} did not finish`));
    child.kill("SIGTERM");
  }, 25000);
  const completion = new Promise<number | null>((resolve) => {
    child.on("close", (code) => {
      closed = true;
      clearTimeout(deadline);
      if (code !== 0 || waiters.size > 0)
        rejectWaiting(diagnostic(`Contention worker ${label} closed with ${String(code)}`));
      resolve(code);
    });
  });
  return {
    child,
    events,
    completion,
    waitFor: (event: string): Promise<WorkerEvent> => {
      const observed = events.find((value) => value.event === event);
      if (observed !== undefined) return Promise.resolve(observed);
      if (failure !== undefined) return Promise.reject(failure);
      if (closed) return Promise.reject(new Error(`Worker ${label} closed before ${event}`));
      return new Promise((resolve, reject) => {
        const listeners = waiters.get(event) ?? [];
        listeners.push({ resolve, reject });
        waiters.set(event, listeners);
      });
    },
    release: () => {
      child.send("release");
    },
    stop: () => {
      clearTimeout(deadline);
      if (!closed) child.kill("SIGTERM");
    },
  };
};
