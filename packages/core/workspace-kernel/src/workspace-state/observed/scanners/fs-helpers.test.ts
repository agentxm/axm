import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import { makeScannerFileSystem, SCANNER_IO_CONCURRENCY } from "./fs-helpers.js";

describe("makeScannerFileSystem", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "scanner-fs-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("shares one filesystem allowance across nested scans of different roots", () => {
    const roots = ["first", "second"].map((root) =>
      Array.from({ length: 12 }, (_, index) => {
        const location = path.join(tempDir, root, `item-${index}`);
        fs.mkdirSync(location, { recursive: true });
        return location;
      }),
    );

    return Effect.gen(function* () {
      const fsService = yield* FileSystem.FileSystem;
      const reachedCapacity = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let active = 0;
      let maximum = 0;
      const observed: FileSystem.FileSystem = {
        ...fsService,
        stat: (location) =>
          Effect.sync(() => {
            active++;
            maximum = Math.max(maximum, active);
          }).pipe(
            Effect.flatMap(() =>
              active === SCANNER_IO_CONCURRENCY
                ? Deferred.succeed(reachedCapacity, undefined)
                : Effect.void,
            ),
            Effect.andThen(Deferred.await(release)),
            Effect.andThen(fsService.stat(location)),
            Effect.ensuring(
              Effect.sync(() => {
                active--;
              }),
            ),
          ),
      };
      const bounded = yield* makeScannerFileSystem(observed);
      const scan = Effect.all(
        roots.map((locations) =>
          Effect.all(
            locations.map((location) => bounded.stat(location)),
            { concurrency: "unbounded" },
          ),
        ),
        { concurrency: "unbounded" },
      );
      const fiber = yield* Effect.forkChild(scan);
      yield* Deferred.await(reachedCapacity);
      yield* Deferred.succeed(release, undefined);
      const scanned = yield* Fiber.join(fiber);
      expect(
        scanned.map((infos) => infos.filter((info) => info.type === "Directory").length),
      ).toEqual([12, 12]);
      expect(maximum).toBe(SCANNER_IO_CONCURRENCY);
    }).pipe(Effect.provide(NodeServices.layer));
  });
});
