import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { UpgradeExecutionObserver } from "../../../application/index.js";
import { makeScriptExecutableInstaller } from "./index.js";

describe("native executable replacement lifetime", () => {
  it.effect("recovers a stale lock's original when the installed path is missing", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-stale-replacement-" });
      const target = path.join(directory, "axm");
      const backupPath = path.join(directory, "original-backup");
      yield* fs.writeFileString(backupPath, "original executable");
      yield* fs.writeFileString(
        `${target}.upgrade.lock`,
        JSON.stringify({ pid: 2_147_483_647, targetPath: target, backupPath }),
      );
      const installer = makeScriptExecutableInstaller(
        fs,
        path,
        {
          run: () => Effect.die("This resource contract must not execute a command"),
          resolveExecutable: () => Effect.die("This resource contract must not resolve PATH"),
        },
        (yield* UpgradeExecutionObserver).command,
      );
      yield* Effect.scoped(
        Effect.gen(function* () {
          const lease = yield* installer.acquire(target);
          expect(lease).not.toBeNull();
          expect(yield* fs.readFileString(target)).toBe("original executable");
          expect(yield* fs.exists(backupPath)).toBe(false);
        }),
      );
      expect(yield* fs.exists(`${target}.upgrade.lock`)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  it.effect("settles an in-flight rename before restoring after interruption", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-interrupted-replace-" });
      const target = path.join(directory, process.platform === "win32" ? "axm.exe" : "axm");
      yield* fs.writeFileString(target, "original executable");
      const replacing = yield* Deferred.make<void>();
      const complete = yield* Deferred.make<void>();
      const installer = makeScriptExecutableInstaller(
        {
          ...fs,
          rename: (source, destination) =>
            Effect.gen(function* () {
              yield* fs.rename(source, destination);
              if (source.includes(".axm-upgrade-")) {
                yield* Deferred.succeed(replacing, undefined);
                yield* Deferred.await(complete);
              }
            }),
        },
        path,
        {
          run: () => Effect.die("This resource contract must not execute a command"),
          resolveExecutable: () => Effect.die("This resource contract must not resolve PATH"),
        },
        (yield* UpgradeExecutionObserver).command,
      );
      const fiber = yield* Effect.scoped(
        Effect.gen(function* () {
          const lease = yield* installer.acquire(target);
          if (lease === null)
            return yield* Effect.die("The isolated fixture lock must be available");
          const staged = yield* lease.stage(new TextEncoder().encode("updated executable"));
          yield* staged.protectOriginal;
          yield* staged.replace;
          return yield* Effect.never;
        }),
      ).pipe(Effect.forkChild);
      yield* Deferred.await(replacing);
      const interrupting = yield* Fiber.interrupt(fiber).pipe(Effect.forkChild);
      yield* Effect.gen(function* () {
        yield* Effect.yieldNow;
        expect(yield* Effect.sync(() => fiber.pollUnsafe())).toBeUndefined();
        expect(yield* fs.readFileString(target)).toBe("updated executable");
      }).pipe(Effect.ensuring(Deferred.succeed(complete, undefined)));
      yield* Fiber.join(interrupting);
      expect(yield* fs.readFileString(target)).toBe("original executable");
      expect(yield* fs.readDirectory(directory)).toEqual([path.basename(target)]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
  for (const disposition of ["preserve-recovery", "accept"] as const) {
    it.effect(`cleans temporary resources and applies ${disposition} to the backup`, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-script-lease-" });
        const target = path.join(directory, process.platform === "win32" ? "axm.exe" : "axm");
        yield* fs.writeFileString(target, "original executable");
        const installer = makeScriptExecutableInstaller(
          fs,
          path,
          {
            run: () => Effect.die("This resource contract must not execute a command"),
            resolveExecutable: () => Effect.die("This resource contract must not resolve PATH"),
          },
          (yield* UpgradeExecutionObserver).command,
        );
        const backupPath = yield* Effect.scoped(
          Effect.gen(function* () {
            const lease = yield* installer.acquire(target);
            if (lease === null)
              return yield* Effect.die("The isolated fixture lock must be available");
            const staged = yield* lease.stage(new TextEncoder().encode("updated executable"));
            yield* staged.protectOriginal;
            yield* staged.replace;
            if (disposition === "accept") yield* staged.accept;
            return staged.backupPath;
          }),
        );
        expect(yield* fs.readFileString(target)).toBe("updated executable");
        const entries = yield* fs.readDirectory(directory);
        if (disposition === "accept") {
          expect(entries).toEqual([path.basename(target)]);
        } else {
          expect(yield* fs.readFileString(backupPath)).toBe("original executable");
          expect(entries.sort()).toEqual([path.basename(backupPath), path.basename(target)].sort());
        }
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }
});
