/**
 * Live application-home adapters for `cli/environment-relocates-user-resources`.
 *
 * The specification lives in
 * `apps/cli-e2e/src/environment-relocates-user-resources.spec.ts` and states the
 * rule over the built CLI. This example composes `@agentxm/registry-auth/live`
 * and `@agentxm/cli-update/live` directly, which an end-to-end project may not
 * do (`system/architecture/e2e-observes-only-shipped-artifacts`), so it runs
 * here beside the composition root that selects those homes. Every assertion it
 * carried in the specification runs unchanged.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import * as ConfigProvider from "effect/ConfigProvider";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";
import { vi } from "vitest";

import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { CredentialStore, PendingDeviceLoginStore } from "@agentxm/registry-auth";
import { CredentialStoreLive, PendingDeviceLoginStoreLive } from "@agentxm/registry-auth/live";
import { InstallMeta } from "@agentxm/cli-update";
import { InstallMetaLive } from "@agentxm/cli-update/live";

import { makeApplicationHomeFixture } from "./test-support/application-home-fixture.js";
import { snapshotWorkspaceContent } from "./test-support/workspace-fixtures.js";

afterEach(() => vi.unstubAllEnvs());

describe("Application-resource home", () => {
  it.effect(
    "live file services read back the selected home and do not consult populated platform resources",
    () => {
      const fixture = makeApplicationHomeFixture();
      const registry = "https://home-isolation.example.test";
      const handle = normalizeHandle("@fixture");
      const pending = {
        version: 2,
        registryUrl: registry,
        deviceCode: "fixture-device",
        userCode: "CODE-1234",
        verificationUri: "https://identity.example.test/device",
        verificationUriComplete: "https://identity.example.test/device?code=CODE-1234",
        requestedScopes: ["extensions:read"],
        interval: 5,
        expiresAt: DateTime.makeUnsafe("2099-01-01T00:00:00Z"),
      };
      for (const [key, value] of Object.entries({
        HOME: fixture.platformHome,
        USERPROFILE: fixture.platformHome,
        HOMEPATH: fixture.platformHome,
        AXM_USER_HOME: fixture.applicationHome,
        SSH_CLIENT: "environment-spec",
        CI: "",
      }))
        vi.stubEnv(key, value);
      // Preserve the existing platform-resource families as adversarial inputs.
      const platformResources = {
        ".config/axm/credentials.json": {
          version: 1,
          registries: {
            [registry]: {
              accounts: {
                [handle]: {
                  access_token: "platform-only-access",
                  refresh_token: "platform-only-refresh",
                  expires_at: "2099-01-01T00:00:00.000Z",
                  active: true,
                },
              },
            },
          },
        },
        ".axm/pending-login.json": {
          ...pending,
          expiresAt: "2099-01-01T00:00:00.000Z",
          deviceCode: "platform-only-device",
        },
        ".axm/install-meta.json": {
          schemaVersion: 2,
          method: "homebrew",
          installedAt: "2026-01-01T00:00:00.000Z",
        },
      };
      for (const [file, content] of Object.entries(platformResources)) {
        const target = path.join(fixture.platformHome, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, JSON.stringify(content));
      }
      const platformBefore = snapshotWorkspaceContent(fixture.platformHome);
      const platform = Layer.mergeAll(
        NodeServices.layer,
        ConfigProvider.layer(
          ConfigProvider.fromEnv({ env: { AXM_USER_HOME: fixture.applicationHome } }),
        ),
      );
      const services = Layer.mergeAll(
        CredentialStoreLive,
        PendingDeviceLoginStoreLive,
        InstallMetaLive,
      ).pipe(Layer.provide(platform));
      return Effect.gen(function* () {
        const credentials = yield* CredentialStore;
        // The supported SSH file tier is selected before any credential action;
        // no operating-system keychain entry is read, written, or cleared.
        expect(credentials.tier).toBe("restricted-file");
        const pendingStore = yield* PendingDeviceLoginStore;
        const metadata = yield* InstallMeta;
        expect(Option.isNone(yield* credentials.load(registry))).toBe(true);
        expect(Option.isNone(yield* pendingStore.load())).toBe(true);
        expect(Option.isNone(yield* metadata.read())).toBe(true);
        yield* credentials.save(registry, handle, {
          access_token: "fixture-access",
          refresh_token: "fixture-refresh",
          expires_at: pending.expiresAt,
        });
        yield* pendingStore.save({ ...pending, version: 2 });
        yield* metadata.write({
          schemaVersion: 2,
          method: "script",
          installedAt: DateTime.makeUnsafe("2026-09-05T00:00:00Z"),
        });
        expect(Option.getOrThrow(yield* credentials.load(registry)).access_token).toBe(
          "fixture-access",
        );
        expect(Option.getOrThrow(yield* pendingStore.load()).deviceCode).toBe(pending.deviceCode);
        expect(Option.getOrThrow(yield* metadata.read()).method).toBe("script");
        // The reviewed promise is containment in the selected home. The exact
        // restricted credential subdirectory remains a documented conflict.
        expect(
          Object.values(snapshotWorkspaceContent(fixture.applicationHome)).some(
            (value) =>
              value.startsWith("file:") &&
              Buffer.from(value.slice(5), "base64").toString("utf8").includes("fixture-access"),
          ),
        ).toBe(true);
        expect(fs.existsSync(path.join(fixture.applicationHome, ".axm/pending-login.json"))).toBe(
          true,
        );
        expect(fs.existsSync(path.join(fixture.applicationHome, ".axm/install-meta.json"))).toBe(
          true,
        );
        expect(snapshotWorkspaceContent(fixture.platformHome)).toEqual(platformBefore);
      }).pipe(Effect.provide(services), Effect.ensuring(Effect.sync(fixture.cleanup)));
    },
  );
});
