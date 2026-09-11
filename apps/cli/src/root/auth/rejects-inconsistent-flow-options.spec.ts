import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { AuthEnvironment, CredentialStore, PendingDeviceLoginStore } from "@agentxm/registry-auth";
import {
  AuthClientTest,
  AuthLoginInteractionTest,
  CredentialStoreTest,
  PendingDeviceLoginStoreTest,
} from "@agentxm/registry-auth/testing";
import { RegistryUrl } from "@agentxm/registry-client";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { defineSpecification } from "@agentxm/specification-metadata";

import { AuthLoginPresenterLive } from "../../auth-login-presenter.js";
import { TestFlagsLayer } from "../../cli-flags/index.js";
import { TestMachineRenderer } from "../../test-support/presenter-test.js";
import { captureHelpDoc } from "../../test-support/command-tree-test-helpers.js";
import { getAppError } from "../../test-support/test-helpers.js";
import { handleLogin } from "./login.js";

export const specification = defineSpecification({
  requirement: "cli/login/rejects-inconsistent-flow-options",
  title: "Sign-in rejects inconsistent flow options",
  statement:
    "When sign-in options combine incompatible start and resume actions or supply a wait timeout without a resume action, AXM shall report usage failure before changing credentials or pending authorization, and shall document the timeout's dependence on resuming.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["apps/cli/src/root/auth/login.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const registry = "https://registry.example.test";
const handle = normalizeHandle("@alice");
const expiry = DateTime.makeUnsafe("2099-01-01T00:00:00.000Z");

const inconsistentOptions = [
  {
    name: "resume combined with a new device sign-in",
    options: { yes: false, deviceCode: true, wait: true, scopes: [] },
  },
  {
    name: "resume combined with restart",
    options: { yes: false, deviceCode: false, wait: true, restart: true, scopes: [] },
  },
  {
    name: "restart without device-code",
    options: { yes: false, deviceCode: false, restart: true, scopes: [] },
  },
  {
    name: "timeout without resume",
    options: { yes: false, deviceCode: true, timeoutSeconds: 5, scopes: [] },
  },
] as const;

describe("Sign-in option validation", () => {
  for (const { name, options } of inconsistentOptions) {
    it.effect(name, () => {
      const renderer = TestMachineRenderer.make();
      const deviceFlowStarts: Array<ReadonlyArray<string>> = [];
      const ports = Layer.mergeAll(
        renderer.layer,
        TestFlagsLayer({ json: true, nonInteractive: true }),
        Layer.succeed(RegistryUrl, registry),
        Layer.succeed(AuthEnvironment, ConfigProvider.fromEnvRecord({})),
        AuthLoginInteractionTest().layer,
        AuthClientTest({
          initiateDeviceFlow: (request) =>
            Effect.sync(() => {
              deviceFlowStarts.push(request?.scopes ?? []);
              return {
                device_code: "fixture-device-secret",
                user_code: "ABCD-1234",
                verification_uri: "https://identity.example.test/device",
                verification_uri_complete:
                  "https://identity.example.test/device?user_code=ABCD-1234",
                interval: 1,
                expires_in: 60,
              };
            }),
        }),
        PendingDeviceLoginStoreTest(),
        CredentialStoreTest("restricted-file", {
          version: 1,
          registries: {
            [registry]: {
              accounts: {
                [handle]: {
                  access_token: "fixture-stored-access",
                  refresh_token: "fixture-stored-refresh",
                  expires_at: expiry,
                  active: true,
                },
              },
            },
          },
        }),
      );
      const layer = Layer.provideMerge(AuthLoginPresenterLive, ports);

      return Effect.gen(function* () {
        const store = yield* CredentialStore;
        const before = yield* store.load(registry);
        const pending = yield* PendingDeviceLoginStore;
        const pendingBefore = yield* pending.load();

        const failure = yield* handleLogin(options).pipe(Effect.flip);

        expect(getAppError(failure).code).toBe("usage");
        // The refusal precedes every sign-in effect.
        expect(deviceFlowStarts).toEqual([]);
        expect(yield* store.load(registry)).toEqual(before);
        expect(yield* pending.load()).toEqual(pendingBefore);
        expect(renderer.state.results).toEqual([]);
      }).pipe(Effect.provide(layer));
    });
  }

  it.effect("login help explains how to bound a pending device sign-in wait", () =>
    Effect.gen(function* () {
      const doc = yield* captureHelpDoc(["login"]);
      const timeout = doc.flags.find((flag) => flag.name === "timeout");
      expect(timeout).toBeDefined();
      expect(timeout && Option.getOrElse(timeout.description, () => "")).toContain(
        "requires --wait",
      );
      expect(doc.examples).toContainEqual({
        command: "axm login --wait --timeout 300",
        description: "Wait up to 300 seconds for a pending device sign-in",
      });
    }),
  );
});
