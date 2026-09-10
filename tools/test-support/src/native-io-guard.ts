import childProcess from "node:child_process";
import nativeFs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import * as Effect from "effect/Effect";
import { expect, vi } from "vitest";

interface ActiveNativeIoGuard {
  depth: number;
  readonly attempts: Array<string>;
  readonly spies: ReadonlyArray<{ readonly mockRestore: () => void }>;
}

let activeGuard: ActiveNativeIoGuard | undefined;

const nativeIoFailure = (attempts: Array<string>, name: string) => () => {
  attempts.push(name);
  throw new Error(`Unexpected native I/O in memory world: ${name}`);
};

/** Detect native filesystem, process, socket, and network escapes after module loading. */
export const withoutNativeIo = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      if (activeGuard !== undefined) {
        activeGuard.depth += 1;
        return activeGuard;
      }
      const attempts: Array<string> = [];
      const fail = (name: string) => nativeIoFailure(attempts, name);
      const spies = [
        vi.spyOn(nativeFs, "access").mockImplementation(fail("fs.access")),
        vi.spyOn(nativeFs, "accessSync").mockImplementation(fail("fs.accessSync")),
        vi.spyOn(nativeFs, "existsSync").mockImplementation(fail("fs.existsSync")),
        vi.spyOn(nativeFs, "readFile").mockImplementation(fail("fs.readFile")),
        vi.spyOn(nativeFs, "readFileSync").mockImplementation(fail("fs.readFileSync")),
        vi.spyOn(nativeFs, "writeFile").mockImplementation(fail("fs.writeFile")),
        vi.spyOn(nativeFs, "writeFileSync").mockImplementation(fail("fs.writeFileSync")),
        vi.spyOn(nativeFs, "stat").mockImplementation(fail("fs.stat")),
        vi.spyOn(nativeFs, "statSync").mockImplementation(fail("fs.statSync")),
        vi.spyOn(nativeFs, "lstat").mockImplementation(fail("fs.lstat")),
        vi.spyOn(nativeFs, "lstatSync").mockImplementation(fail("fs.lstatSync")),
        vi.spyOn(nativeFs, "readdir").mockImplementation(fail("fs.readdir")),
        vi.spyOn(nativeFs, "readdirSync").mockImplementation(fail("fs.readdirSync")),
        vi.spyOn(nativeFs, "mkdir").mockImplementation(fail("fs.mkdir")),
        vi.spyOn(nativeFs, "mkdirSync").mockImplementation(fail("fs.mkdirSync")),
        vi.spyOn(nativeFs, "mkdtemp").mockImplementation(fail("fs.mkdtemp")),
        vi.spyOn(nativeFs, "mkdtempSync").mockImplementation(fail("fs.mkdtempSync")),
        vi.spyOn(nativeFs, "rm").mockImplementation(fail("fs.rm")),
        vi.spyOn(nativeFs, "rmSync").mockImplementation(fail("fs.rmSync")),
        vi.spyOn(nativeFs, "rmdir").mockImplementation(fail("fs.rmdir")),
        vi.spyOn(nativeFs, "rmdirSync").mockImplementation(fail("fs.rmdirSync")),
        vi.spyOn(nativeFs, "unlink").mockImplementation(fail("fs.unlink")),
        vi.spyOn(nativeFs, "unlinkSync").mockImplementation(fail("fs.unlinkSync")),
        vi.spyOn(nativeFs, "rename").mockImplementation(fail("fs.rename")),
        vi.spyOn(nativeFs, "renameSync").mockImplementation(fail("fs.renameSync")),
        vi.spyOn(nativeFs, "copyFile").mockImplementation(fail("fs.copyFile")),
        vi.spyOn(nativeFs, "copyFileSync").mockImplementation(fail("fs.copyFileSync")),
        vi.spyOn(nativeFs, "cp").mockImplementation(fail("fs.cp")),
        vi.spyOn(nativeFs, "cpSync").mockImplementation(fail("fs.cpSync")),
        vi.spyOn(nativeFs, "open").mockImplementation(fail("fs.open")),
        vi.spyOn(nativeFs, "openSync").mockImplementation(fail("fs.openSync")),
        vi.spyOn(nativeFs, "realpath").mockImplementation(fail("fs.realpath")),
        vi.spyOn(nativeFs, "realpathSync").mockImplementation(fail("fs.realpathSync")),
        vi.spyOn(nativeFs, "readlink").mockImplementation(fail("fs.readlink")),
        vi.spyOn(nativeFs, "readlinkSync").mockImplementation(fail("fs.readlinkSync")),
        vi.spyOn(nativeFs, "symlink").mockImplementation(fail("fs.symlink")),
        vi.spyOn(nativeFs, "symlinkSync").mockImplementation(fail("fs.symlinkSync")),
        vi.spyOn(nativeFs, "utimes").mockImplementation(fail("fs.utimes")),
        vi.spyOn(nativeFs, "utimesSync").mockImplementation(fail("fs.utimesSync")),
        vi.spyOn(nativeFs.promises, "access").mockImplementation(fail("fs.promises.access")),
        vi.spyOn(nativeFs.promises, "cp").mockImplementation(fail("fs.promises.cp")),
        vi.spyOn(nativeFs.promises, "mkdir").mockImplementation(fail("fs.promises.mkdir")),
        vi.spyOn(nativeFs.promises, "mkdtemp").mockImplementation(fail("fs.promises.mkdtemp")),
        vi.spyOn(nativeFs.promises, "open").mockImplementation(fail("fs.promises.open")),
        vi.spyOn(nativeFs.promises, "readFile").mockImplementation(fail("fs.promises.readFile")),
        vi.spyOn(nativeFs.promises, "readdir").mockImplementation(fail("fs.promises.readdir")),
        vi.spyOn(nativeFs.promises, "readlink").mockImplementation(fail("fs.promises.readlink")),
        vi.spyOn(nativeFs.promises, "realpath").mockImplementation(fail("fs.promises.realpath")),
        vi.spyOn(nativeFs.promises, "rename").mockImplementation(fail("fs.promises.rename")),
        vi.spyOn(nativeFs.promises, "rm").mockImplementation(fail("fs.promises.rm")),
        vi.spyOn(nativeFs.promises, "stat").mockImplementation(fail("fs.promises.stat")),
        vi.spyOn(nativeFs.promises, "symlink").mockImplementation(fail("fs.promises.symlink")),
        vi.spyOn(nativeFs.promises, "writeFile").mockImplementation(fail("fs.promises.writeFile")),
        ...(
          ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"] as const
        ).map((method) =>
          vi.spyOn(childProcess, method).mockImplementation(fail(`child_process.${method}`)),
        ),
        vi.spyOn(http, "request").mockImplementation(fail("http.request")),
        vi.spyOn(https, "request").mockImplementation(fail("https.request")),
        vi.spyOn(net, "connect").mockImplementation(fail("net.connect")),
        vi.spyOn(net.Server.prototype, "listen").mockImplementation(fail("net.Server.listen")),
        vi.spyOn(globalThis, "fetch").mockImplementation(fail("fetch")),
        vi.spyOn(globalThis, "setInterval").mockImplementation(fail("setInterval")),
        vi.spyOn(globalThis, "setTimeout").mockImplementation(fail("setTimeout")),
      ];
      activeGuard = { depth: 1, attempts, spies };
      return activeGuard;
    }),
    () => effect,
    (guard) =>
      Effect.sync(() => {
        guard.depth -= 1;
        if (guard.depth > 0) return;
        for (const spy of guard.spies) spy.mockRestore();
        if (activeGuard === guard) activeGuard = undefined;
        expect(guard.attempts).toEqual([]);
      }),
  );
