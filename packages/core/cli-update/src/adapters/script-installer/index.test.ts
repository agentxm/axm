import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import { makeScriptExecutableInstaller } from "./index.js";

describe("native executable replacement lifetime", () => {
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
          yield* Ref.make(0),
        );
        const backupPath = yield* Effect.scoped(
          Effect.gen(function* () {
            const lease = yield* installer.acquire(target);
            if (lease === null)
              return yield* Effect.die("The isolated fixture lock must be available");
            const staged = yield* lease.stage(new TextEncoder().encode("updated executable"));
            if (staged === null)
              return yield* Effect.die("The isolated fixture must stage successfully");
            expect(yield* staged.protectOriginal).toBe(true);
            expect(yield* staged.replace).toBe(true);
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
