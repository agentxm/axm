/**
 * Unit tests for the auth login command handler.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { AuthClientTest, type MeResponse } from "../../../auth/auth-client.js";
import { RegistryUrl } from "../../../auth/auth-middleware.js";
import { CredentialStore, CredentialStoreTest } from "../../../auth/credential-store.js";
import {
  makeClackLogTestLayer,
  makeClackSpinnerTestLayer,
  makeClackPromptTestLayer,
} from "../../../clack-effect/index.js";
import { CliFlagsTest } from "../../../cli-flags/index.js";
import { makeCliError } from "../../../cli-error/index.js";
import { handleLogin } from "./handler.js";

const REGISTRY_URL = "https://registry.agentxm.ai";

const makeLayers = (opts?: {
  nonInteractive?: boolean;
  yes?: boolean;
  existingCredentials?: boolean;
  meResponse?: MeResponse;
  confirmValue?: boolean;
}) => {
  const [logLayer, mockLog] = makeClackLogTestLayer();
  const [spinnerLayer, mockSpinner] = makeClackSpinnerTestLayer();
  const [promptLayer, mockPrompt] = makeClackPromptTestLayer({
    defaultBehavior: { type: "return", value: "" },
    methodBehaviors: {
      confirm: { type: "return", value: opts?.confirmValue ?? true },
      select: { type: "select", index: 0 },
      multiselect: { type: "multiselect", indices: [] },
    },
  });

  const flagsLayer = CliFlagsTest({
    nonInteractive: opts?.nonInteractive ?? false,
    yes: opts?.yes ?? false,
  });

  const credStoreLayer = opts?.existingCredentials
    ? CredentialStoreTest("encrypted-file", {
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
    logLayer,
    spinnerLayer,
    promptLayer,
    flagsLayer,
    credStoreLayer,
    authClientLayer,
    registryUrlLayer,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
  const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
    effect.pipe(Effect.provide(FullLayer));

  return { provide, mockLog, mockSpinner, mockPrompt };
};

describe("auth login handler", () => {
  it.effect("rejects in non-interactive mode", () => {
    const { provide } = makeLayers({ nonInteractive: true });
    return provide(
      Effect.gen(function* () {
        const result = yield* handleLogin().pipe(
          Effect.catchTag("CliError", (e) => Effect.succeed({ error: true, code: e.code })),
        );
        expect(result).toMatchObject({ error: true, code: "AUTH_LOGIN_REQUIRED" });
      }),
    );
  });

  it.effect("completes device flow and displays handle", () => {
    const { provide, mockLog } = makeLayers();
    return provide(
      Effect.gen(function* () {
        yield* handleLogin();
        expect(mockLog.logs.success.some((m) => m.includes("Logged in as alice"))).toBe(true);
      }),
    );
  });

  it.effect("displays URL and code for manual entry", () => {
    const { provide, mockLog } = makeLayers();
    return provide(
      Effect.gen(function* () {
        yield* handleLogin();
        const steps = mockLog.calls.filter((c) => c.method === "step").map((c) => c.args[0]);
        expect(
          steps.some((m) => String(m).includes("https://auth.agentxm.ai/device?code=ABCD-1234")),
        ).toBe(true);
        expect(steps.some((m) => String(m).includes("ABCD-1234"))).toBe(true);
      }),
    );
  });

  it.effect("prompts when already logged in", () => {
    const { provide, mockLog, mockPrompt } = makeLayers({
      existingCredentials: true,
      confirmValue: true,
    });
    return provide(
      Effect.gen(function* () {
        yield* handleLogin();
        expect(mockLog.logs.info.some((m) => m.includes("Already logged in"))).toBe(true);
        expect(mockPrompt.calls.some((c) => c.method === "confirm")).toBe(true);
        expect(mockLog.logs.success.some((m) => m.includes("Logged in as alice"))).toBe(true);
      }),
    );
  });

  it.effect("skips prompt when already logged in with --yes", () => {
    const { provide, mockLog, mockPrompt } = makeLayers({
      existingCredentials: true,
      yes: true,
    });
    return provide(
      Effect.gen(function* () {
        yield* handleLogin();
        expect(mockLog.logs.info.some((m) => m.includes("Already logged in"))).toBe(true);
        expect(mockPrompt.calls.filter((c) => c.method === "confirm")).toHaveLength(0);
        expect(mockLog.logs.success.some((m) => m.includes("Logged in as alice"))).toBe(true);
      }),
    );
  });

  it.effect("returns early when user declines re-login", () => {
    const { provide, mockLog } = makeLayers({
      existingCredentials: true,
      confirmValue: false,
    });
    return provide(
      Effect.gen(function* () {
        yield* handleLogin();
        expect(mockLog.logs.success.filter((m) => m.includes("Logged in"))).toHaveLength(0);
      }),
    );
  });

  it.effect("fails closed when getMe fails", () => {
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
          makeCliError({
            code: "AUTH_UNAUTHENTICATED",
            what: "Not authenticated or token is invalid",
          }),
        ),
    });

    const [logLayer2, mockLog2] = makeClackLogTestLayer();
    const [spinnerLayer2] = makeClackSpinnerTestLayer();
    const [promptLayer2] = makeClackPromptTestLayer({
      defaultBehavior: { type: "return", value: "" },
      methodBehaviors: {
        confirm: { type: "return", value: true },
      },
    });

    const layer = Layer.mergeAll(
      logLayer2,
      spinnerLayer2,
      promptLayer2,
      CliFlagsTest({ nonInteractive: false }),
      CredentialStoreTest(),
      authClientLayer,
      Layer.succeed(RegistryUrl, REGISTRY_URL),
    );

    return handleLogin().pipe(
      Effect.as("unexpected_success" as const),
      Effect.catchTag("CliError", (error) =>
        Effect.gen(function* () {
          expect(error.code).toBe("AUTH_UNAUTHENTICATED");
          expect(
            mockLog2.logs.success.some((m) => m.includes("Login successful")),
          ).toBe(false);

          const credStore = yield* CredentialStore;
          const stored = yield* credStore.load(REGISTRY_URL);
          expect(stored._tag).toBe("None");
          return "expected_failure" as const;
        }),
      ),
      Effect.provide(layer),
      Effect.map((result) => {
        expect(result).toBe("expected_failure");
      }),
    );
  });
});
