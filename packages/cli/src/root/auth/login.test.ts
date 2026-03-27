/**
 * Unit tests for the auth login command handler.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  AuthClientTest,
  AuthLoginInteractionTest,
  type MeResponse,
  RegistryUrl,
  CredentialStore,
  CredentialStoreTest,
} from "@axm.sh/core/unstable/auth";
import { TestRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { makeTestPrompt } from "@axm.sh/core/unstable/cli-prompt";
import { CliEnvironmentTest } from "@axm.sh/core/unstable/cli-flags";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import { handleLogin } from "./login.js";

const REGISTRY_URL = "https://registry.agentxm.ai";

const makeLayers = (opts?: {
  nonInteractive?: boolean;
  yes?: boolean;
  existingCredentials?: boolean;
  meResponse?: MeResponse;
  confirmValue?: boolean;
}) => {
  const { layer: rendererLayer, state: rendererState } = TestRenderer.make();
  const [promptLayer, promptState] = makeTestPrompt({
    confirmResponses: [opts?.confirmValue ?? true],
  });
  const interactionLayer = AuthLoginInteractionTest().layer;

  const flagsLayer = CliEnvironmentTest({
    nonInteractive: opts?.nonInteractive ?? false,
  });

  const credStoreLayer = opts?.existingCredentials
    ? CredentialStoreTest("restricted-file", {
        version: 1,
        registries: {
          [REGISTRY_URL]: {
            accounts: {
              alice: {
                access_token: "axm_ses_existing",
                refresh_token: "axm_ref_existing",
                expires_at: "2099-01-01T00:00:00Z",
                active: true,
              },
            },
          },
        },
      })
    : CredentialStoreTest();

  const meData: MeResponse = opts?.meResponse ?? {
    userId: "user-1",
    userHandle: "alice",
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
        expires_at: "2099-06-01T00:00:00Z",
      }),
    getMe: () => Effect.succeed(meData),
  });

  const registryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);

  const FullLayer = Layer.mergeAll(
    rendererLayer,
    promptLayer,
    interactionLayer,
    flagsLayer,
    credStoreLayer,
    authClientLayer,
    registryUrlLayer,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
  const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
    effect.pipe(Effect.provide(FullLayer));

  return { provide, rendererState, promptState };
};

describe("auth login handler", () => {
  it.effect("rejects in non-interactive mode", () => {
    const { provide } = makeLayers({ nonInteractive: true });
    return provide(
      Effect.gen(function* () {
        const result = yield* handleLogin({ yes: false }).pipe(
          Effect.catchTag("AppError", (e) => Effect.succeed({ error: true, code: e.code })),
        );
        expect(result).toMatchObject({ error: true, code: "AUTH_LOGIN_REQUIRED" });
      }),
    );
  });

  it.effect("completes device flow and displays handle", () => {
    const { provide, rendererState } = makeLayers();
    return provide(
      Effect.gen(function* () {
        yield* handleLogin({ yes: false });
        expect(
          rendererState.logs.some(
            (l) => l._tag === "success" && l.message.includes("Logged in as alice"),
          ),
        ).toBe(true);
      }),
    );
  });

  it.effect("displays URL and code for manual entry", () => {
    const { provide, rendererState } = makeLayers();
    return provide(
      Effect.gen(function* () {
        yield* handleLogin({ yes: false });
        const steps = rendererState.logs.filter((l) => l._tag === "step").map((l) => l.message);
        expect(steps.some((m) => m.includes("https://auth.agentxm.ai/device?code=ABCD-1234"))).toBe(
          true,
        );
        expect(steps.some((m) => m.includes("ABCD-1234"))).toBe(true);
      }),
    );
  });

  it.effect("prompts when already logged in", () => {
    const { provide, rendererState, promptState } = makeLayers({
      existingCredentials: true,
      confirmValue: true,
    });
    return provide(
      Effect.gen(function* () {
        yield* handleLogin({ yes: false });
        expect(
          rendererState.logs.some(
            (l) => l._tag === "info" && l.message.includes("Already logged in"),
          ),
        ).toBe(true);
        expect(promptState.confirmCalls.length > 0).toBe(true);
        expect(
          rendererState.logs.some(
            (l) => l._tag === "success" && l.message.includes("Logged in as alice"),
          ),
        ).toBe(true);
      }),
    );
  });

  it.effect("skips prompt when already logged in with --yes", () => {
    const { provide, rendererState, promptState } = makeLayers({
      existingCredentials: true,
      yes: true,
    });
    return provide(
      Effect.gen(function* () {
        yield* handleLogin({ yes: true });
        expect(
          rendererState.logs.some(
            (l) => l._tag === "info" && l.message.includes("Already logged in"),
          ),
        ).toBe(true);
        expect(promptState.confirmCalls).toHaveLength(0);
        expect(
          rendererState.logs.some(
            (l) => l._tag === "success" && l.message.includes("Logged in as alice"),
          ),
        ).toBe(true);
      }),
    );
  });

  it.effect("returns early when user declines re-login", () => {
    const { provide, rendererState } = makeLayers({
      existingCredentials: true,
      confirmValue: false,
    });
    return provide(
      Effect.gen(function* () {
        yield* handleLogin({ yes: false });
        expect(
          rendererState.logs.filter((l) => l._tag === "success" && l.message.includes("Logged in")),
        ).toHaveLength(0);
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
          expires_at: "2099-06-01T00:00:00Z",
        }),
      getMe: () =>
        Effect.fail(
          makeAppError({
            code: "AUTH_UNAUTHENTICATED",
            what: "Not authenticated or token is invalid",
          }),
        ),
    });

    const { layer: rendererLayer2, state: rendererState2 } = TestRenderer.make();
    const [promptLayer2] = makeTestPrompt({
      confirmResponses: [true],
    });
    const interactionLayer2 = AuthLoginInteractionTest().layer;

    const layer = Layer.mergeAll(
      rendererLayer2,
      promptLayer2,
      interactionLayer2,
      CliEnvironmentTest({ nonInteractive: false }),
      CredentialStoreTest(),
      authClientLayer,
      Layer.succeed(RegistryUrl, REGISTRY_URL),
    );

    return Effect.gen(function* () {
      yield* handleLogin({ yes: false });

      expect(
        rendererState2.logs.some(
          (l) => l._tag === "success" && l.message.includes("Login successful"),
        ),
      ).toBe(true);
      expect(
        rendererState2.logs.some((l) => l._tag === "success" && l.message.includes("Logged in as")),
      ).toBe(false);

      const credStore = yield* CredentialStore;
      const stored = yield* credStore.load(REGISTRY_URL);
      expect(stored._tag).toBe("Some");
      if (stored._tag === "Some") {
        expect(stored.value.handle).toBe("unknown");
        expect(stored.value.access_token).toBe("axm_ses_new");
      }
    }).pipe(Effect.provide(layer));
  });
});
