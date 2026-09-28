import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";

import { loadOrCreateInstallationId } from "./installation-identity.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

const temporaryHome = Effect.acquireRelease(
  Effect.sync(() => nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "axm-identity-"))),
  (home) => Effect.sync(() => nodeFs.rmSync(home, { recursive: true, force: true })),
);

const identityStorage = (home: string) =>
  Layer.mergeAll(
    NodeServices.layer,
    ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: home } })),
  );

/**
 * Storage whose writes stall after creating their file and before writing to
 * it, as a native write does when it is aborted while its open is in flight.
 */
const stallingWrites = (started: Deferred.Deferred<void>) =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.map(FileSystem.FileSystem, (fs) =>
      FileSystem.FileSystem.of({
        ...fs,
        writeFileString: (path, _data, options) =>
          fs
            .writeFileString(path, "", options)
            .pipe(
              Effect.andThen(Deferred.succeed(started, undefined)),
              Effect.andThen(Effect.never),
            ),
      }),
    ),
  );

describe("installation identity", () => {
  it.effect("an interrupted first creation leaves no identity behind for the next load", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const home = yield* temporaryHome;
        const storage = identityStorage(home);
        const started = yield* Deferred.make<void>();
        const creating = yield* loadOrCreateInstallationId.pipe(
          Effect.provide(Layer.provideMerge(stallingWrites(started), storage)),
          Effect.forkChild,
        );
        yield* Deferred.await(started);
        yield* Fiber.interrupt(creating);

        const directory = nodePath.join(home, ".axm", "telemetry");
        expect(nodeFs.readdirSync(directory)).toEqual([]);

        const identity = yield* loadOrCreateInstallationId.pipe(Effect.provide(storage));
        expect(identity).toMatch(UUID_PATTERN);
        expect(nodeFs.readdirSync(directory)).toEqual(["installation-id"]);
        expect(nodeFs.readFileSync(nodePath.join(directory, "installation-id"), "utf8")).toBe(
          `${identity}\n`,
        );
        expect(yield* loadOrCreateInstallationId.pipe(Effect.provide(storage))).toBe(identity);
      }),
    ),
  );
});
