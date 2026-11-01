import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as ConfigProvider from "effect/ConfigProvider";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Ref from "effect/Ref";

import {
  PendingDeviceLoginStore,
  PendingDeviceLoginStoreLive,
  PendingDeviceLoginStoreTest,
  type PendingDeviceLogin,
} from "./pending-device-login-store.js";

const pending: PendingDeviceLogin = {
  version: 3,
  registryUrl: "https://registry.agentxm.ai",
  deviceCode: "device-secret",
  userCode: "ABCD-1234",
  verificationUri: "https://agentxm.ai/device",
  verificationUriComplete: "https://agentxm.ai/device?user_code=ABCD-1234",
  interval: 5,
  expiresAt: DateTime.makeUnsafe("2099-08-03T15:10:00Z"),
};

/**
 * The live store over the real filesystem. AXM configuration comes from the
 * provided environment; `HOME` stays a process variable because node:os reads
 * the platform home from it.
 */
const liveStore = (environment: Record<string, string>) =>
  PendingDeviceLoginStoreLive.pipe(
    Layer.provide(
      Layer.merge(
        NodeServices.layer,
        ConfigProvider.layer(ConfigProvider.fromEnv({ env: environment })),
      ),
    ),
  );

const testHome = "/pending-login-home";
const testDirectory = `${testHome}/.axm`;
const testFile = `${testDirectory}/pending-login.json`;

/** Filesystem substitutions exercise failure semantics, not native mode enforcement. */
const injectedStore = (fileSystem: FileSystem.FileSystem) =>
  PendingDeviceLoginStoreLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(FileSystem.FileSystem, fileSystem),
        Path.layer,
        ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: testHome } })),
      ),
    ),
  );

const fileFailure = (method: string, reason: "NotFound" | "PermissionDenied", path = testFile) =>
  PlatformError.systemError({
    _tag: reason,
    module: "FileSystem",
    method,
    pathOrDescriptor: path,
  });

describe("PendingDeviceLoginStore", () => {
  it.effect("persists and clears one pending flow", () =>
    Effect.gen(function* () {
      const store = yield* PendingDeviceLoginStore;
      expect(Option.isNone(yield* store.load())).toBe(true);

      yield* store.save(pending);
      const loaded = yield* store.load();
      expect(Option.isSome(loaded)).toBe(true);
      if (Option.isSome(loaded)) {
        expect(loaded.value).toEqual(pending);
      }

      yield* store.clear();
      expect(Option.isNone(yield* store.load())).toBe(true);
    }).pipe(Effect.provide(PendingDeviceLoginStoreTest())),
  );

  it.effect("writes the directory and bearer-equivalent device code with restrictive modes", () => {
    const home = mkdtempSync(join(tmpdir(), "axm-pending-login-"));
    const previousHome = process.env["HOME"];
    process.env["HOME"] = home;
    const layer = liveStore({});

    return Effect.gen(function* () {
      const store = yield* PendingDeviceLoginStore;
      yield* store.save(pending);
      expect(statSync(join(home, ".axm")).mode & 0o777).toBe(0o700);
      expect(statSync(join(home, ".axm", "pending-login.json")).mode & 0o777).toBe(0o600);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (previousHome === undefined) delete process.env["HOME"];
          else process.env["HOME"] = previousHome;
          rmSync(home, { recursive: true, force: true });
        }),
      ),
      Effect.provide(layer),
    );
  });

  it.effect("removes invalid pending state so a new sign-in can recover", () => {
    const home = mkdtempSync(join(tmpdir(), "axm-pending-login-invalid-"));
    const previousHome = process.env["HOME"];
    process.env["HOME"] = home;
    const directory = join(home, ".axm");
    const file = join(directory, "pending-login.json");
    mkdirSync(directory);
    writeFileSync(file, '{"version":1}');
    const layer = liveStore({});

    return Effect.gen(function* () {
      const store = yield* PendingDeviceLoginStore;
      const error = yield* Effect.flip(store.load());
      expect(error.detail).toContain("has been removed");
      expect(existsSync(file)).toBe(false);
      expect(Option.isNone(yield* store.load())).toBe(true);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (previousHome === undefined) delete process.env["HOME"];
          else process.env["HOME"] = previousHome;
          rmSync(home, { recursive: true, force: true });
        }),
      ),
      Effect.provide(layer),
    );
  });

  it.effect("uses AXM_USER_HOME without writing pending state under HOME", () => {
    const realHome = mkdtempSync(join(tmpdir(), "axm-real-home-"));
    const axmUserHome = mkdtempSync(join(tmpdir(), "axm-user-home-"));
    const previousHome = process.env["HOME"];
    process.env["HOME"] = realHome;
    const layer = liveStore({ AXM_USER_HOME: axmUserHome });

    return Effect.gen(function* () {
      const store = yield* PendingDeviceLoginStore;
      yield* store.save(pending);
      expect(existsSync(join(axmUserHome, ".axm", "pending-login.json"))).toBe(true);
      expect(existsSync(join(realHome, ".axm"))).toBe(false);
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (previousHome === undefined) delete process.env["HOME"];
          else process.env["HOME"] = previousHome;
          rmSync(realHome, { recursive: true, force: true });
          rmSync(axmUserHome, { recursive: true, force: true });
        }),
      ),
      Effect.provide(layer),
    );
  });

  it.effect("treats a missing file as absence when reading or clearing it", () =>
    Effect.gen(function* () {
      const store = yield* PendingDeviceLoginStore;
      expect(yield* store.load()).toEqual(Option.none());
      yield* store.clear();
    }).pipe(
      Effect.provide(
        injectedStore(
          FileSystem.makeNoop({
            readFileString: () => Effect.fail(fileFailure("readFileString", "NotFound")),
            remove: () => Effect.fail(fileFailure("remove", "NotFound")),
          }),
        ),
      ),
    ),
  );

  for (const operation of ["load", "clear"] as const) {
    it.effect(`preserves a permission failure while attempting to ${operation}`, () => {
      const failure = fileFailure(
        operation === "load" ? "readFileString" : "remove",
        "PermissionDenied",
      );
      const fileSystem = FileSystem.makeNoop({
        readFileString: () => Effect.fail(failure),
        remove: () => Effect.fail(failure),
      });

      return Effect.gen(function* () {
        const store = yield* PendingDeviceLoginStore;
        const error = yield* Effect.flip(store[operation]());
        expect(error.category).toBe("auth");
        expect(error.cause).toBe(failure);
      }).pipe(Effect.provide(injectedStore(fileSystem)));
    });
  }

  for (const subject of ["directory", "file"] as const) {
    it.effect(`reports failure to restrict ${subject} permissions`, () =>
      Effect.gen(function* () {
        const directoryMode = yield* Ref.make(0);
        const writes = yield* Ref.make<
          ReadonlyArray<{ readonly content: string; readonly mode: number | undefined }>
        >([]);
        const committedTo = yield* Ref.make<Option.Option<string>>(Option.none());
        const failurePath = subject === "directory" ? testDirectory : testFile;
        const failure = fileFailure("chmod", "PermissionDenied", failurePath);
        const fileSystem = FileSystem.makeNoop({
          makeDirectory: (_path, options) => Ref.set(directoryMode, options?.mode ?? 0),
          chmod: (path) => (path === failurePath ? Effect.fail(failure) : Effect.void),
          readDirectory: () => Effect.succeed([]),
          writeFileString: (_path, content, options) =>
            Ref.update(writes, (previous) => [...previous, { content, mode: options?.mode }]),
          rename: (_source, target) => Ref.set(committedTo, Option.some(target)),
        });
        const error = yield* Effect.gen(function* () {
          const store = yield* PendingDeviceLoginStore;
          return yield* Effect.flip(store.save(pending));
        }).pipe(Effect.provide(injectedStore(fileSystem)));

        expect(error.category).toBe("auth");
        expect(error.cause).toBe(failure);
        expect(yield* Ref.get(directoryMode)).toBe(0o700);
        if (subject === "directory") {
          expect(yield* Ref.get(writes)).toEqual([]);
          expect(yield* Ref.get(committedTo)).toEqual(Option.none());
        } else {
          const written = yield* Ref.get(writes);
          expect(written).toHaveLength(1);
          expect(written[0]).toMatchObject({ mode: 0o600 });
          expect(written[0]?.content).toContain(pending.deviceCode);
          expect(yield* Ref.get(committedTo)).toEqual(Option.some(testFile));
        }
      }),
    );
  }

  for (const cleanup of ["removed", "missing", "denied"] as const) {
    it.effect(`reports invalid state truthfully when cleanup is ${cleanup}`, () => {
      const deviceCode = "private-device-code-must-not-appear-in-errors";
      const invalid = JSON.stringify({ ...pending, version: 1, deviceCode });
      const failure = fileFailure(
        "remove",
        cleanup === "missing" ? "NotFound" : "PermissionDenied",
      );

      return Effect.gen(function* () {
        const removed = yield* Ref.make<ReadonlyArray<string>>([]);
        const fileSystem = FileSystem.makeNoop({
          readFileString: () => Effect.succeed(invalid),
          remove: (path) =>
            Ref.update(removed, (previous) => [...previous, path]).pipe(
              Effect.andThen(cleanup === "removed" ? Effect.void : Effect.fail(failure)),
            ),
        });
        const error = yield* Effect.gen(function* () {
          const store = yield* PendingDeviceLoginStore;
          return yield* Effect.flip(store.load());
        }).pipe(Effect.provide(injectedStore(fileSystem)));

        expect(error.category).toBe("auth");
        expect(yield* Ref.get(removed)).toEqual([testFile]);
        if (cleanup === "denied") {
          expect(error.detail).toContain("could not be removed");
          expect(error.detail).not.toContain("has been removed");
          expect(error.cause).toEqual({
            _tag: "PendingDeviceLoginCleanupFailed",
            validation: { _tag: "PendingDeviceLoginDecodeError" },
            cleanup: failure,
          });
        } else {
          expect(error.detail).toContain("has been removed");
          expect(error.suggestions).toContainEqual({
            description: "Start a new sign-in.",
            cmd: "axm login --device-code --json",
          });
          expect(error.cause).toEqual({ _tag: "PendingDeviceLoginDecodeError" });
        }
        expect(JSON.stringify(error)).not.toContain(deviceCode);
        expect(String(error)).not.toContain(deviceCode);
      });
    });
  }
});
