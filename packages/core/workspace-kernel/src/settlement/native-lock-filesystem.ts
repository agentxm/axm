// @effect-diagnostics nodeBuiltinImport:off — proper-lockfile owns this callback-style native filesystem boundary
import * as nodeFs from "node:fs";
import { captureWork, type WorkCapture } from "@agentxm/host-primitives/work-observation";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

const TRANSITION_LOCK_FILENAME = "workspace-transition.lock";
type NativePhase = "acquire" | "heartbeat" | "release" | "cleanup" | "exit";
type NativeOperation = "mkdir" | "stat" | "utimes" | "write-file" | "unlink" | "rmdir";
type NativeCallback<A extends ReadonlyArray<unknown> = []> = (
  error: NodeJS.ErrnoException | null,
  ...values: A
) => void;
interface NativeLockFileSystem {
  readonly mkdir: (target: nodeFs.PathLike, callback: NativeCallback) => void;
  readonly stat: (target: nodeFs.PathLike, callback: NativeCallback<[nodeFs.Stats]>) => void;
  readonly utimes: (
    target: nodeFs.PathLike,
    atime: nodeFs.TimeLike,
    mtime: nodeFs.TimeLike,
    callback: NativeCallback,
  ) => void;
  readonly writeFile: (
    target: nodeFs.PathLike,
    content: string,
    options: { readonly flag: string },
    callback: NativeCallback,
  ) => void;
  readonly unlink: (target: nodeFs.PathLike, callback: NativeCallback) => void;
  readonly rmdir: (target: nodeFs.PathLike, callback: NativeCallback) => void;
  readonly unlinkSync: (target: nodeFs.PathLike) => void;
  readonly rmdirSync: (target: nodeFs.PathLike) => void;
}

/**
 * Acquisition creates the holder placeholder before proper-lockfile probes mtime.
 * Later holder writes overwrite that existing file without changing directory mtime.
 * Removal clears only that placeholder before non-recursive rmdir; foreign content
 * still prevents removal. Keep this protocol identical for observed native calls.
 */
const lockDirectoryFileSystem = (native: NativeLockFileSystem) => ({
  ...nodeFs,
  stat: native.stat,
  utimes: native.utimes,
  mkdir: (target: nodeFs.PathLike, callback: nodeFs.NoParamCallback): void => {
    if (typeof target !== "string" || !target.endsWith(TRANSITION_LOCK_FILENAME)) {
      native.mkdir(target, callback);
      return;
    }
    native.mkdir(target, (directoryError) => {
      if (directoryError !== null) {
        callback(directoryError);
        return;
      }
      const holderPath = `${target}/holder.json`;
      native.writeFile(holderPath, "", { flag: "wx" }, (holderError) => {
        if (holderError === null) {
          callback(null);
          return;
        }
        native.unlink(holderPath, () => {
          native.rmdir(target, () => callback(holderError));
        });
      });
    });
  },
  rmdir: (target: nodeFs.PathLike, callback: nodeFs.NoParamCallback): void => {
    if (typeof target === "string" && target.endsWith(TRANSITION_LOCK_FILENAME)) {
      native.unlink(`${target}/holder.json`, () => {
        native.rmdir(target, callback);
      });
      return;
    }
    native.rmdir(target, callback);
  },
  rmdirSync: (target: nodeFs.PathLike): void => {
    if (typeof target === "string" && target.endsWith(TRANSITION_LOCK_FILENAME)) {
      try {
        native.unlinkSync(`${target}/holder.json`);
      } catch {
        // Absent metadata blocks nothing; foreign content still blocks rmdir.
      }
    }
    native.rmdirSync(target);
  },
});

// proper-lockfile stores mtime precision under its private Symbol on this object.
// Every observed adapter must share that state or it would repeat the utimes probe.
const sharedFileSystem = lockDirectoryFileSystem(nodeFs);

interface ObservedLockFileSystem {
  readonly fs: Pick<NativeLockFileSystem, "mkdir" | "stat" | "utimes" | "rmdir" | "rmdirSync">;
  readonly during: <A, E, R>(
    phase: "acquire" | "release" | "cleanup",
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}

/**
 * Raw callback observations record native API calls, not syscalls or idle timer duration.
 * Timers retain their acquisition's causal parent after the acquire span ends.
 * Sync exit cleanup can record completion but cannot promise an asynchronous exporter flush.
 */
const makeObservedLockFileSystemState = (): ObservedLockFileSystem => {
  let phase: NativePhase = "acquire";
  let capture: WorkCapture | undefined;
  const start = (operation: NativeOperation, bytes: number | null, exit = false) => {
    const work = capture?.begin("axm.native.lock-io", {
      attributes: {
        "axm.native.operation": operation,
        "axm.native.phase": exit ? "exit" : phase,
        "axm.work.executed": 1,
      },
    });
    return (error: unknown): void => {
      if (work === undefined) return;
      const success = error === null || error === undefined;
      if (success && bytes !== null) work.annotate({ "axm.work.bytes": bytes });
      if (!success) {
        const code =
          typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
        work.annotate({
          "axm.failure.kind":
            code === "ENOENT"
              ? "not-found"
              : code === "EACCES" || code === "EPERM"
                ? "denied"
                : code === "ETIMEDOUT"
                  ? "timeout"
                  : "failure",
        });
      }
      work.finish(success ? "success" : "failure");
    };
  };
  const callback = <A extends ReadonlyArray<unknown>>(
    operation: NativeOperation,
    invoke: (done: NativeCallback<A>) => void,
    done: NativeCallback<A>,
    bytes: number | null = null,
  ) => {
    const end = start(operation, bytes);
    try {
      invoke((error, ...values) => {
        end(error);
        done(error, ...values);
      });
    } catch (error) {
      end(error);
      throw error;
    }
  };
  const sync = (operation: "unlink" | "rmdir", invoke: () => void) => {
    const end = start(operation, null, true);
    try {
      invoke();
      end(undefined);
    } catch (error) {
      end(error);
      throw error;
    }
  };
  const native: NativeLockFileSystem = {
    mkdir: (target, done) => callback("mkdir", (done) => nodeFs.mkdir(target, done), done),
    stat: (target, done) => callback("stat", (done) => nodeFs.stat(target, done), done),
    utimes: (target, atime, mtime, done) =>
      callback("utimes", (done) => nodeFs.utimes(target, atime, mtime, done), done),
    writeFile: (target, content, options, done) =>
      callback(
        "write-file",
        (done) => nodeFs.writeFile(target, content, options, done),
        done,
        Buffer.byteLength(content),
      ),
    unlink: (target, done) => callback("unlink", (done) => nodeFs.unlink(target, done), done),
    rmdir: (target, done) => callback("rmdir", (done) => nodeFs.rmdir(target, done), done),
    unlinkSync: (target) => sync("unlink", () => nodeFs.unlinkSync(target)),
    rmdirSync: (target) => sync("rmdir", () => nodeFs.rmdirSync(target)),
  };
  const observed = lockDirectoryFileSystem(native);
  const fs = new Proxy(sharedFileSystem, {
    get(target, key, receiver) {
      switch (key) {
        case "mkdir":
          return observed.mkdir;
        case "rmdir":
          return observed.rmdir;
        case "rmdirSync":
          return observed.rmdirSync;
        case "stat":
          return observed.stat;
        case "utimes":
          return observed.utimes;
        default:
          return Reflect.get(target, key, receiver);
      }
    },
  });
  return {
    fs,
    during: <A, E, R>(next: "acquire" | "release" | "cleanup", effect: Effect.Effect<A, E, R>) =>
      Effect.useSpan(
        `axm.native.lock-${next}`,
        { attributes: { "axm.work.executed": 1 } },
        (span) =>
          Effect.gen(function* () {
            phase = next;
            capture = yield* captureWork;
          }).pipe(
            Effect.andThen(effect),
            Effect.onExit((exit) =>
              Effect.sync(() => {
                if (next === "acquire" && Exit.isSuccess(exit)) phase = "heartbeat";
              }),
            ),
            Effect.withParentSpan(span),
          ),
      ),
  };
};

// Construction only allocates the callback adapter. Native failures occur later
// at its callback/synchronous API boundary and retain that API's error behavior.
export const makeObservedLockFileSystem: Effect.Effect<ObservedLockFileSystem> = Effect.sync(
  makeObservedLockFileSystemState,
);
