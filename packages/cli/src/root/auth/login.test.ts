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
  LoopbackLoginFallback,
  RegistryUrl,
  CredentialStore,
  CredentialStoreTest,
} from "@agentxm/client-core/unstable/auth";
import { TestMachineRenderer, TestRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { normalizeHandle } from "@agentxm/client-core/unstable/extensions";
import { expectAppliedPlanResult, expectNoOpPlanResult } from "../../test-helpers.js";
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
        verification_uri_complete: "https://auth.agentxm.ai/device?code=ABCD-1234",
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
    interactionLayer,
    flagsLayer,
    credStoreLayer,
    authClientLayer,
    registryUrlLayer,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
  const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
    effect.pipe(Effect.provide(FullLayer));

  return { provide, rendererState };
};

describe("auth login handler", () => {
  it.effect("rejects in non-interactive mode", () => {
    const { provide } = makeLayers({ nonInteractive: true });
    return provide(
      Effect.gen(function* () {
        const result = yield* handleLogin({
          yes: false,
          deviceCode: true,
          noBrowser: false,
          scopes: [],
        }).pipe(Effect.catchTag("AppError", (e) => Effect.succeed({ error: true, code: e.code })));
        expect(result).toMatchObject({ error: true, code: "auth" });
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
          noBrowser: false,
          scopes: [],
        }).pipe(Effect.catchTag("AppError", (e) => Effect.succeed({ error: true, code: e.code })));
        expect(result).toMatchObject({ error: true, code: "auth" });
      }),
    );
  });

  it.effect("completes device flow and displays handle", () => {
    const { provide, rendererState } = makeLayers();
    return provide(
      Effect.gen(function* () {
        yield* handleLogin({ yes: false, deviceCode: true, noBrowser: false, scopes: [] });
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
            noBrowser: false,
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

  it.effect("omits environment fallback prose in machine JSON mode", () => {
    const previousCi = process.env["CI"];
    process.env["CI"] = "1";
    const { provide, rendererState } = makeLayers({ machine: true, json: true });

    return provide(
      Effect.gen(function* () {
        yield* handleLogin({ yes: false, deviceCode: false, noBrowser: false, scopes: [] });

        expect(rendererState.logs.filter((log) => log._tag === "info")).toEqual([]);
        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Log in to AXM registry",
        });
        expect(result).toMatchObject({
          steps: [
            {
              label: "Registry credentials",
              status: "applied",
              artifact: {
                path: "registry.agentxm.ai",
                scope: "user",
                change: "created",
              },
            },
          ],
          status: "logged-in",
          registryHost: "registry.agentxm.ai",
          handle: ALICE,
        });
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            if (previousCi === undefined) {
              delete process.env["CI"];
            } else {
              process.env["CI"] = previousCi;
            }
          }),
        ),
      ),
    );
  });

  it.effect("omits loopback fallback prose in machine JSON mode", () => {
    const { provide, rendererState } = makeLayers({ machine: true, json: true });

    return provide(
      Effect.gen(function* () {
        yield* handleLogin(
          { yes: false, deviceCode: false, noBrowser: false, scopes: [] },
          {
            runLoopbackLogin: () =>
              Effect.fail(
                new LoopbackLoginFallback({
                  reason: "bind_failed",
                  message: "Loopback port unavailable.",
                }),
              ),
          },
        );

        expect(rendererState.logs.filter((log) => log._tag === "info")).toEqual([]);
        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Log in to AXM registry",
        });
        expect(result).toMatchObject({
          steps: [
            {
              label: "Registry credentials",
              status: "applied",
              artifact: {
                path: "registry.agentxm.ai",
                scope: "user",
                change: "created",
              },
            },
          ],
          status: "logged-in",
          registryHost: "registry.agentxm.ai",
          handle: ALICE,
        });
      }),
    );
  });

  it.effect("displays URL and code for manual entry", () => {
    const { provide, rendererState } = makeLayers();
    return provide(
      Effect.gen(function* () {
        yield* handleLogin({ yes: false, deviceCode: true, noBrowser: false, scopes: [] });
        const steps = rendererState.logs.filter((l) => l._tag === "step").map((l) => l.message);
        expect(steps.some((m) => m.includes("https://auth.agentxm.ai/device"))).toBe(true);
        expect(steps.some((m) => m.includes("ABCD-1234"))).toBe(true);
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
          { yes: false, deviceCode: true, noBrowser: false, scopes: [] },
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
        yield* handleLogin({ yes: true, deviceCode: true, noBrowser: false, scopes: [] });
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
          { yes: false, deviceCode: true, noBrowser: false, scopes: [] },
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
          { yes: false, deviceCode: true, noBrowser: false, scopes: [] },
          {
            confirmRelogin: () => Effect.succeed(false),
          },
        );

        expect(
          rendererState.logs.filter((log) => log._tag === "info" || log._tag === "success"),
        ).toEqual([]);
        const result = expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Log in to AXM registry",
          totalSteps: 1,
        });
        expect(result).toMatchObject({
          steps: [
            {
              label: "Registry credentials",
              status: "unchanged",
              artifact: {
                path: "registry.agentxm.ai",
                scope: "user",
                change: "unchanged",
              },
            },
          ],
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
        yield* handleLogin({ yes: false, deviceCode: true, noBrowser: false, scopes: [] });
        expect(
          rendererState.logs.some(
            (l) => l._tag === "info" && l.message.includes("Already logged in"),
          ),
        ).toBe(false);
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
          verification_uri_complete: "https://auth.agentxm.ai/device?code=ABCD-1234",
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
      interactionLayer2,
      TestFlagsLayer({ nonInteractive: false }),
      CredentialStoreTest(),
      authClientLayer,
      Layer.succeed(RegistryUrl, REGISTRY_URL),
    );

    return Effect.gen(function* () {
      yield* handleLogin({ yes: false, deviceCode: true, noBrowser: false, scopes: [] });

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
