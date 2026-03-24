/**
 * Unit tests for the auth whoami command handler.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { vi, beforeEach } from "vitest";

import { AuthClientTest } from "../../../auth/auth-client.js";
import { RegistryUrl } from "../../../auth/auth-middleware.js";
import { CredentialStoreTest } from "../../../auth/credential-store.js";
import { resetEnvVarMessageFlag } from "../../../auth/token-resolution.js";
import { makeClackLogTestLayer } from "../../../clack-effect/index.js";
import { CliFlagsTest } from "../../../cli-flags/index.js";
import { CliEnvConfig } from "../../../config/index.js";
import { handleWhoami } from "./handler.js";

const REGISTRY_URL = "https://registry.agentxm.ai";

const defaultMe = {
  userId: "user-1",
  userHandle: "alice",
  email: "alice@example.com",
  tokenType: "session",
  scopes: ["extensions:read", "account:read"],
  orgs: [{ id: "org-1", handle: "acme" }],
};

const makeLayers = (opts?: { hasCredentials?: boolean }) => {
  const [logLayer, mockLog] = makeClackLogTestLayer();

  const credStoreLayer = opts?.hasCredentials
    ? CredentialStoreTest("encrypted-file", {
        version: 1,
        registries: {
          [REGISTRY_URL]: {
            accounts: {
              alice: {
                access_token: "axm_ses_tok",
                refresh_token: "axm_ref_tok",
                expires_at: "2099-01-01T00:00:00Z",
                active: true,
              },
            },
          },
        },
      })
    : CredentialStoreTest();

  const authClientLayer = AuthClientTest({
    getMe: () => Effect.succeed(defaultMe),
  });

  const registryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);

  const FullLayer = Layer.mergeAll(
    logLayer,
    CliFlagsTest(),
    credStoreLayer,
    authClientLayer,
    registryUrlLayer,
    CliEnvConfig.testDefaults,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
  const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
    effect.pipe(Effect.provide(FullLayer));

  return { provide, mockLog };
};

describe("auth whoami handler", () => {
  beforeEach(() => {
    resetEnvVarMessageFlag();
  });

  it.effect("fails with AUTH_LOGIN_REQUIRED when no token", () => {
    const { provide } = makeLayers();
    return provide(
      Effect.gen(function* () {
        const result = yield* handleWhoami({ json: false }).pipe(
          Effect.catchTag("AppError", (e) => Effect.succeed({ error: true, code: e.code })),
        );
        expect(result).toMatchObject({ error: true, code: "AUTH_LOGIN_REQUIRED" });
      }),
    );
  });

  it.effect("displays identity in human-readable format", () => {
    const { provide, mockLog } = makeLayers({ hasCredentials: true });
    return provide(
      Effect.gen(function* () {
        yield* handleWhoami({ json: false });
        expect(mockLog.logs.info.some((m) => m.includes("alice"))).toBe(true);
        expect(mockLog.logs.info.some((m) => m.includes("alice@example.com"))).toBe(true);
        expect(mockLog.logs.info.some((m) => m.includes("session"))).toBe(true);
      }),
    );
  });

  it.effect("outputs JSON when --json flag is set", () => {
    const { provide } = makeLayers({ hasCredentials: true });
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    return provide(
      Effect.gen(function* () {
        yield* handleWhoami({ json: true });
        const output = writeSpy.mock.calls.map((c) => String(c[0])).join("");
        const parsed = JSON.parse(output) as Record<string, unknown>;
        expect(parsed["userHandle"]).toBe("alice");
        expect(parsed["email"]).toBe("alice@example.com");
        expect(parsed["tokenType"]).toBe("session");
        writeSpy.mockRestore();
      }),
    );
  });
});
