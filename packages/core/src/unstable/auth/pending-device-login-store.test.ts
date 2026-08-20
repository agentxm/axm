import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import {
  PendingDeviceLoginStore,
  PendingDeviceLoginStoreLive,
  PendingDeviceLoginStoreTest,
  type PendingDeviceLogin,
} from "./pending-device-login-store.js";

const pending: PendingDeviceLogin = {
  version: 2,
  registryUrl: "https://registry.agentxm.ai",
  deviceCode: "device-secret",
  userCode: "ABCD-1234",
  verificationUri: "https://agentxm.ai/device",
  verificationUriComplete: "https://agentxm.ai/device?user_code=ABCD-1234",
  requestedScopes: ["account:read", "extensions:read"],
  interval: 5,
  expiresAt: DateTime.makeUnsafe("2099-08-03T15:10:00Z"),
};

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
    const layer = PendingDeviceLoginStoreLive.pipe(Layer.provide(NodeServices.layer));

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
    const layer = PendingDeviceLoginStoreLive.pipe(Layer.provide(NodeServices.layer));

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
});
