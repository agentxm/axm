import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { PendingDeviceLoginStore } from "@agentxm/registry-access/authentication";
import { CredentialStore } from "@agentxm/registry-access/credentials";
import { AuthEnvironment } from "@agentxm/registry-access/adapters";
import {
  AuthClientTest,
  AuthLoginInteractionTest,
  CredentialStoreTest,
  PendingDeviceLoginStoreTest,
} from "@agentxm/registry-access/testing";
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
    "When sign-in options request a restart without device-code sign-in or a wait bound that is not a positive number of seconds, AXM shall report usage failure before changing credentials or pending authorization, and shall document the single-invocation bounded device sign-in wait.",
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
    name: "restart without device-code",
    options: { yes: false, deviceCode: false, restart: true },
  },
  {
    name: "zero wait bound",
    options: { yes: false, deviceCode: true, waitForHumanSeconds: 0 },
  },
  {
    name: "negative wait bound",
    options: { yes: false, deviceCode: false, waitForHumanSeconds: -5 },
  },
  {
    name: "wait bound beyond a safe integer",
    options: { yes: false, deviceCode: true, waitForHumanSeconds: Number.MAX_SAFE_INTEGER + 1 },
  },
] as const;

describe("Sign-in option validation", () => {
  for (const { name, options } of inconsistentOptions) {
    it.effect(name, () => {
      const renderer = TestMachineRenderer.make();
      const deviceFlowStarts: Array<string> = [];
      const ports = Layer.mergeAll(
        renderer.layer,
        TestFlagsLayer({ json: true, nonInteractive: true }),
        Layer.succeed(RegistryUrl, registry),
        Layer.succeed(AuthEnvironment, ConfigProvider.fromEnvRecord({})),
        AuthLoginInteractionTest().layer,
        AuthClientTest({
          initiateDeviceFlow: () =>
            Effect.sync(() => {
              deviceFlowStarts.push("fixture-device-secret");
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

  it.effect("login help explains how to wait for device sign-in in one invocation", () =>
    Effect.gen(function* () {
      const doc = yield* captureHelpDoc(["login"]);
      const flagNames = doc.flags.map((flag) => flag.name);
      expect(flagNames).toContain("wait-for-human");
      expect(flagNames).not.toContain("wait");
      expect(flagNames).not.toContain("timeout");
      const wait = doc.flags.find((flag) => flag.name === "wait-for-human");
      expect(wait && Option.getOrElse(wait.description, () => "")).toContain("seconds");
      expect(doc.examples).toContainEqual({
        command: "axm login --device-code --wait-for-human 300 --json",
        description: "Start or resume device sign-in and wait up to 300 seconds",
      });
    }),
  );
});
