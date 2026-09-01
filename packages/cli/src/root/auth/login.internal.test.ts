/**
 * Unit tests for the auth login command handler.
 */

import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  AuthClientTest,
  AuthLoginInteractionTest,
  type MeResponse,
  LoopbackCallbackRejected,
  LoopbackLoginFallback,
  CredentialStore,
  CredentialStoreTest,
  PendingDeviceLoginStoreTest,
} from "@agentxm/extension-management/unstable/auth";
import { RegistryUrl } from "@agentxm/extension-management/unstable/registry";
import {
  TestMachineRenderer,
  TestRenderer,
} from "@agentxm/extension-management/unstable/cli-renderer";
import { TestFlagsLayer } from "@agentxm/extension-management/unstable/cli-flags";
import { AuthLoginPresenterLive } from "@agentxm/extension-management/unstable/cli-runtime";
import { makeAppError } from "@agentxm/extension-management/unstable/app-error";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { expectRecord, property } from "../../test-helpers.js";
import { handleLogin } from "./login.js";

const REGISTRY_URL = "https://registry.agentxm.ai";
const ALICE = normalizeHandle("@alice");
const UNKNOWN = normalizeHandle("@unknown");

const makeLayers = (opts?: {
  nonInteractive?: boolean;
  yes?: boolean;
  existingCredentials?: boolean;
  meResponse?: MeResponse;
  confirmValue?: boolean;
  getMeFails?: boolean;
  allowsPersistedCredentials?: boolean;
  machine?: boolean;
  json?: boolean;
}) => {
  const renderer = opts?.machine ? TestMachineRenderer.make() : TestRenderer.make();
  const rendererLayer = renderer.layer;
  const rendererState = renderer.state;
  const interactionLayer = AuthLoginInteractionTest().layer;

  const flagsLayer = TestFlagsLayer({
    nonInteractive: opts?.nonInteractive ?? false,
    json: opts?.json ?? false,
  });
  const credStoreLayer = opts?.existingCredentials
    ? CredentialStoreTest(
        "restricted-file",
        {
          version: 1,
          registries: {
            [REGISTRY_URL]: {
              accounts: {
                [ALICE]: {
                  access_token: "axm_ses_existing",
                  refresh_token: "axm_ref_existing",
                  expires_at: DateTime.makeUnsafe("2099-01-01T00:00:00Z"),
                  active: true,
                },
              },
            },
          },
        },
        opts?.allowsPersistedCredentials,
      )
    : CredentialStoreTest("restricted-file", undefined, opts?.allowsPersistedCredentials);

  const meData: MeResponse = opts?.meResponse ?? {
    userId: "user-1",
    userHandle: ALICE,
    email: "alice@example.com",
    tokenType: "session",
    scopes: ["extensions:read"],
    orgs: [],
  };

  const authClientLayer = AuthClientTest({
    initiateDeviceFlow: () =>
      Effect.succeed({
        device_code: "dc-123",
        user_code: "ABCD-1234",
        verification_uri: "https://auth.agentxm.ai/device",
        verification_uri_complete: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
        interval: 5,
        expires_in: 600,
      }),
    pollDeviceToken: () =>
      Effect.succeed({
        access_token: "axm_ses_new",
        refresh_token: "axm_ref_new",
        expires_at: DateTime.makeUnsafe("2099-06-01T00:00:00Z"),
      }),
    getMe: opts?.getMeFails
      ? () =>
          Effect.fail(
            makeAppError({
              code: "auth",
              detail: "Token invalid",
            }),
          )
      : () => Effect.succeed(meData),
  });

  const registryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);

  const FullLayer = Layer.mergeAll(
    NodeServices.layer,
    rendererLayer,
    // The real renderer-backed presenter keeps the output assertions
    // observing the CLI wording and machine documents.
    Layer.provide(AuthLoginPresenterLive, rendererLayer),
    interactionLayer,
    flagsLayer,
    credStoreLayer,
    PendingDeviceLoginStoreTest(),
    authClientLayer,
    registryUrlLayer,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
  const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
    effect.pipe(Effect.provide(FullLayer));

  return { provide, rendererState };
};

describe("auth login handler", () => {
  it.effect("starts a non-blocking device flow in non-interactive mode", () => {
    const { provide, rendererState } = makeLayers({
      nonInteractive: true,
      machine: true,
      json: true,
    });
    return provide(
      Effect.gen(function* () {
        yield* handleLogin({
          yes: false,
          deviceCode: false,
          scopes: [],
        });
        expect(rendererState.results[0]?.data).toMatchObject({
          result: {
            status: "pending-human",
            verificationUri: "https://auth.agentxm.ai/device",
            userCode: "ABCD-1234",
            resume: "axm login --wait --json",
          },
        });
      }),
    );
  });

  it.effect("skips the relogin prompt for a valid non-interactive session", () => {
    const { provide, rendererState } = makeLayers({
      nonInteractive: true,
      machine: true,
      json: true,
      existingCredentials: true,
    });
    let promptCalls = 0;
    return provide(
      Effect.gen(function* () {
        yield* handleLogin(
          { yes: false, deviceCode: false, scopes: [] },
          {
            confirmRelogin: () => {
              promptCalls += 1;
              return Effect.succeed(true);
            },
          },
        );
        expect(promptCalls).toBe(0);
        const result = expectRecord(
          property(expectRecord(rendererState.results[0]?.data), "result"),
        );
        expect(result).toEqual({
          status: "already-logged-in",
          registryHost: "registry.agentxm.ai",
          handle: ALICE,
        });
      }),
    );
  });

  it.effect("rejects when persisted credentials are disabled", () => {
    const { provide } = makeLayers({ allowsPersistedCredentials: false });
    return provide(
      Effect.gen(function* () {
        const result = yield* handleLogin({
          yes: false,
          deviceCode: true,
          scopes: [],
        }).pipe(Effect.catchTag("AppError", (e) => Effect.succeed({ error: true, code: e.code })));
        expect(result).toMatchObject({ error: true, code: "auth_required" });
      }),
    );
  });

  it.effect("completes device flow and displays handle", () => {
    const { provide, rendererState } = makeLayers();
    return provide(
      Effect.gen(function* () {
        yield* handleLogin({ yes: false, deviceCode: true, scopes: [] });
        expect(
          rendererState.logs.some(
            (l) =>
              l._tag === "success" &&
              l.message.includes(`Logged in to registry.agentxm.ai as ${ALICE}.`),
          ),
        ).toBe(true);
      }),
    );
  });

  it.effect("passes requested scopes to device login", () => {
    const { provide } = makeLayers();
    const deviceLoginCalls: Array<ReadonlyArray<string> | undefined> = [];

    return provide(
      Effect.gen(function* () {
        yield* handleLogin(
          {
            yes: false,
            deviceCode: true,
            scopes: ["extensions:publish:new"],
          },
          {
            runDeviceLogin: (_registryUrl, options) => {
              deviceLoginCalls.push(options?.scopes);
              return Effect.void;
            },
          },
        );

        expect(deviceLoginCalls).toEqual([["extensions:publish:new"]]);
      }),
    );
  });

  it.effect("passes explicit restart intent to device login", () => {
    const { provide } = makeLayers();
    const restartOptions: Array<boolean | undefined> = [];

    return provide(
      Effect.gen(function* () {
        yield* handleLogin(
          {
            yes: false,
            deviceCode: true,
            restart: true,
            scopes: [],
          },
          {
            runDeviceLogin: (_registryUrl, options) => {
              restartOptions.push(options?.restart);
              return Effect.void;
            },
          },
        );

        expect(restartOptions).toEqual([true]);
      }),
    );
  });

  it.effect("requires device-code mode for explicit restart", () => {
    const { provide } = makeLayers();

    return provide(
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          handleLogin({
            yes: false,
            deviceCode: false,
            restart: true,
            scopes: [],
          }),
        );

        expect(error).toMatchObject({
          code: "usage",
          detail: "--restart requires --device-code.",
        });
      }),
    );
  });

  it.effect("does not launch a browser for explicit device-code login", () => {
    const { provide } = makeLayers();
    const openBrowserOptions: Array<boolean | undefined> = [];

    return provide(
      Effect.gen(function* () {
        yield* handleLogin(
          { yes: false, deviceCode: true, scopes: [] },
          {
            runDeviceLogin: (_registryUrl, options) => {
              openBrowserOptions.push(options?.openBrowser);
              return Effect.void;
            },
          },
        );

        expect(openBrowserOptions).toEqual([false]);
      }),
    );
  });

  it.effect("does not fall back to device code after loopback timeout", () => {
    const { provide } = makeLayers();
    let deviceLoginCalls = 0;

    return provide(
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          handleLogin(
            { yes: false, deviceCode: false, scopes: [] },
            {
              loginStrategyEnvironment: { DISPLAY: ":0" },
              runLoopbackLogin: () =>
                Effect.fail(
                  new LoopbackLoginFallback({
                    reason: "timeout",
                    message: "Timed out waiting for the browser callback.",
                  }),
                ),
              runDeviceLogin: () => {
                deviceLoginCalls += 1;
                return Effect.void;
              },
            },
          ),
        );

        expect(error).toMatchObject({
          detail: "Browser sign-in expired after 5 minutes. No credentials were changed.",
        });
        if (error._tag !== "AppError") {
          throw new Error("Expected an AppError");
        }
        expect(error.suggestions).toEqual([
          { description: "Try browser sign-in again.", cmd: "axm login" },
          {
            description: "Use device-code sign-in on a remote or headless machine.",
            cmd: "axm login --device-code",
          },
        ]);
        expect(deviceLoginCalls).toBe(0);
      }),
    );
  });

  it.effect("maps denied loopback authorization to a stable cancellation message", () => {
    const { provide } = makeLayers();

    return provide(
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          handleLogin(
            { yes: false, deviceCode: false, scopes: [] },
            {
              loginStrategyEnvironment: { DISPLAY: ":0" },
              runLoopbackLogin: () =>
                Effect.fail(
                  new LoopbackCallbackRejected({
                    reason: "access_denied",
                    message: "Authorization failed: access_denied.",
                  }),
                ),
            },
          ),
        );

        expect(error).toMatchObject({
          detail: "Sign-in was cancelled. No credentials were changed.",
        });
      }),
    );
  });

  it.effect("explains automatic headless selection in machine mode", () => {
    const { provide, rendererState } = makeLayers({ machine: true, json: true });

    return provide(
      Effect.gen(function* () {
        yield* handleLogin(
          { yes: false, deviceCode: false, scopes: [] },
          { loginStrategyEnvironment: { CI: "1" } },
        );

        const instructions = rendererState.logs
          .filter((log) => log._tag === "info")
          .map((log) => log.message);
        expect(instructions).toContain("Sign in to AgentXM.ai with a one-time code");
        expect(instructions).toContain(
          "This environment appears to be remote or headless; using device-code sign-in.",
        );
        const result = expectRecord(
          property(expectRecord(rendererState.results[0]?.data), "result"),
        );
        expect(result).toEqual({
          status: "logged-in",
          registryHost: "registry.agentxm.ai",
          handle: ALICE,
        });
      }),
    );
  });

  it.effect(
    "emits required device instructions after loopback bind fallback in machine mode",
    () => {
      const { provide, rendererState } = makeLayers({ machine: true, json: true });

      return provide(
        Effect.gen(function* () {
          yield* handleLogin(
            { yes: false, deviceCode: false, scopes: [] },
            {
              loginStrategyEnvironment: { DISPLAY: ":0" },
              runLoopbackLogin: () =>
                Effect.fail(
                  new LoopbackLoginFallback({
                    reason: "bind_failed",
                    message: "Loopback port unavailable.",
                  }),
                ),
            },
          );

          const instructions = rendererState.logs
            .filter((log) => log._tag === "info")
            .map((log) => log.message);
          expect(instructions).toContain("Sign in to AgentXM.ai with a one-time code");
          expect(instructions).toContain(
            "Could not start a local callback server; using device-code sign-in instead.",
          );
          const result = expectRecord(
            property(expectRecord(rendererState.results[0]?.data), "result"),
          );
          expect(result).toEqual({
            status: "logged-in",
            registryHost: "registry.agentxm.ai",
            handle: ALICE,
          });
        }),
      );
    },
  );

  it.effect("displays the complete URL, clean fallback, and code separately", () => {
    const { provide, rendererState } = makeLayers();
    return provide(
      Effect.gen(function* () {
        yield* handleLogin({ yes: false, deviceCode: true, scopes: [] });
        const instructions = rendererState.logs
          .filter((log) => log._tag === "info")
          .map((log) => log.message);
        expect(rendererState.suggestions).toContainEqual({
          description: "Open the AXM device authorization page",
          url: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
        });
        expect(rendererState.suggestions).toContainEqual({
          description: "Open the clean fallback page and enter the code",
          url: "https://auth.agentxm.ai/device",
        });
        expect(instructions.some((message) => message.includes("ABCD-1234"))).toBe(true);
      }),
    );
  });

  it.effect("prompts when already logged in", () => {
    const { provide, rendererState } = makeLayers({
      existingCredentials: true,
    });
    const confirmCalls: Array<string> = [];
    return provide(
      Effect.gen(function* () {
        yield* handleLogin(
          { yes: false, deviceCode: true, scopes: [] },
          {
            confirmRelogin: (message) => {
              confirmCalls.push(message);
              return Effect.succeed(true);
            },
          },
        );
        expect(
          rendererState.logs.some(
            (l) => l._tag === "info" && l.message.includes("Already logged in"),
          ),
        ).toBe(true);
        expect(confirmCalls).toEqual(["Log in with a different account?"]);
        expect(
          rendererState.logs.some(
            (l) =>
              l._tag === "success" &&
              l.message.includes(`Logged in to registry.agentxm.ai as ${ALICE}.`),
          ),
        ).toBe(true);
      }),
    );
  });

  it.effect("skips prompt when already logged in with --yes", () => {
    const { provide, rendererState } = makeLayers({
      existingCredentials: true,
      yes: true,
    });
    return provide(
      Effect.gen(function* () {
        yield* handleLogin({ yes: true, deviceCode: true, scopes: [] });
        expect(
          rendererState.logs.some(
            (l) => l._tag === "info" && l.message.includes("Already logged in"),
          ),
        ).toBe(true);
        expect(
          rendererState.logs.some(
            (l) =>
              l._tag === "success" &&
              l.message.includes(`Logged in to registry.agentxm.ai as ${ALICE}.`),
          ),
        ).toBe(true);
      }),
    );
  });

  it.effect("returns early when user declines re-login", () => {
    const { provide, rendererState } = makeLayers({
      existingCredentials: true,
    });
    const confirmCalls: Array<string> = [];
    return provide(
      Effect.gen(function* () {
        yield* handleLogin(
          { yes: false, deviceCode: true, scopes: [] },
          {
            confirmRelogin: (message) => {
              confirmCalls.push(message);
              return Effect.succeed(false);
            },
          },
        );
        expect(confirmCalls).toEqual(["Log in with a different account?"]);
        expect(
          rendererState.logs.filter(
            (l) => l._tag === "success" && l.message.includes("Logged in to"),
          ),
        ).toHaveLength(0);
        expect(rendererState.logs).toContainEqual({
          _tag: "success",
          message: "Already logged in to registry.agentxm.ai as @alice.",
        });
        expect(rendererState.suggestions).toEqual([
          { description: "Check active account", cmd: "axm whoami" },
          { description: "Log out", cmd: "axm logout" },
        ]);
      }),
    );
  });

  it.effect("emits structured no-op when user declines re-login in machine mode", () => {
    const { provide, rendererState } = makeLayers({
      existingCredentials: true,
      machine: true,
      json: true,
    });
    return provide(
      Effect.gen(function* () {
        yield* handleLogin(
          { yes: false, deviceCode: true, scopes: [] },
          {
            confirmRelogin: () => Effect.succeed(false),
          },
        );

        expect(
          rendererState.logs.filter((log) => log._tag === "info" || log._tag === "success"),
        ).toEqual([]);
        const result = expectRecord(
          property(expectRecord(rendererState.results[0]?.data), "result"),
        );
        expect(result).toEqual({
          status: "already-logged-in",
          registryHost: "registry.agentxm.ai",
          handle: ALICE,
        });
        expect(rendererState.suggestions).toEqual([
          { description: "Check active account", cmd: "axm whoami" },
          { description: "Log out", cmd: "axm logout" },
        ]);
      }),
    );
  });

  it.effect("proceeds directly to login when stored token is invalid", () => {
    const { provide, rendererState } = makeLayers({
      existingCredentials: true,
      getMeFails: true,
    });
    return provide(
      Effect.gen(function* () {
        yield* handleLogin({ yes: false, deviceCode: true, scopes: [] });
        expect(
          rendererState.logs.some(
            (l) => l._tag === "info" && l.message.includes("Already logged in"),
          ),
        ).toBe(false);
        expect(rendererState.logs).toContainEqual({
          _tag: "info",
          message: "Your saved credentials are no longer valid. Starting a new sign-in…",
        });
      }),
    );
  });

  it.effect("persists placeholder credentials when getMe fails", () => {
    const authClientLayer = AuthClientTest({
      initiateDeviceFlow: () =>
        Effect.succeed({
          device_code: "dc-123",
          user_code: "ABCD-1234",
          verification_uri: "https://auth.agentxm.ai/device",
          verification_uri_complete: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
          interval: 5,
          expires_in: 600,
        }),
      pollDeviceToken: () =>
        Effect.succeed({
          access_token: "axm_ses_new",
          refresh_token: "axm_ref_new",
          expires_at: DateTime.makeUnsafe("2099-06-01T00:00:00Z"),
        }),
      getMe: () =>
        Effect.fail(
          makeAppError({
            code: "auth",
            detail: "Not authenticated or token is invalid",
          }),
        ),
    });

    const { layer: rendererLayer2, state: rendererState2 } = TestRenderer.make();
    const interactionLayer2 = AuthLoginInteractionTest().layer;

    const layer = Layer.mergeAll(
      NodeServices.layer,
      rendererLayer2,
      Layer.provide(AuthLoginPresenterLive, rendererLayer2),
      interactionLayer2,
      TestFlagsLayer({ nonInteractive: false }),
      CredentialStoreTest(),
      PendingDeviceLoginStoreTest(),
      authClientLayer,
      Layer.succeed(RegistryUrl, REGISTRY_URL),
    );

    return Effect.gen(function* () {
      yield* handleLogin({ yes: false, deviceCode: true, scopes: [] });

      expect(
        rendererState2.logs.some(
          (l) => l._tag === "success" && l.message.includes("Logged in to registry.agentxm.ai."),
        ),
      ).toBe(true);
      expect(
        rendererState2.logs.some((l) => l._tag === "success" && l.message.includes("as ")),
      ).toBe(false);

      const credStore = yield* CredentialStore;
      const stored = yield* credStore.load(REGISTRY_URL);
      expect(stored._tag).toBe("Some");
      if (stored._tag === "Some") {
        expect(stored.value.handle).toBe(UNKNOWN);
        expect(stored.value.access_token).toBe("axm_ses_new");
      }
    }).pipe(Effect.provide(layer));
  });
});
