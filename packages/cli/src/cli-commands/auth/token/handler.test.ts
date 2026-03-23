/**
 * Unit tests for the auth token command handler.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import { vi, beforeEach } from "vitest";

import { RegistryUrl } from "../../../auth/auth-middleware.js";
import { CredentialStoreTest } from "../../../auth/credential-store.js";
import { resetEnvVarMessageFlag } from "../../../auth/token-resolution.js";
import { CliFlagsTest } from "../../../cli-flags/index.js";
import { CliEnvConfig, type CliEnvConfigService } from "../../../config/index.js";
import { handleToken } from "./handler.js";

const REGISTRY_URL = "https://registry.agentxm.ai";

const makeLayers = (opts?: {
  hasCredentials?: boolean;
  configOverrides?: Partial<CliEnvConfigService>;
}) => {
  const credStoreLayer = opts?.hasCredentials
    ? CredentialStoreTest("encrypted-file", {
        version: 1,
        registries: {
          [REGISTRY_URL]: {
            accounts: {
              alice: {
                access_token: "axm_ses_mytoken",
                refresh_token: "axm_ref_mytoken",
                expires_at: "2099-01-01T00:00:00Z",
                active: true,
              },
            },
          },
        },
      })
    : CredentialStoreTest();

  const registryUrlLayer = Layer.succeed(RegistryUrl, REGISTRY_URL);

  const configLayer = opts?.configOverrides
    ? Layer.succeed(CliEnvConfig, {
        registryUrl: "https://registry.agentxm.ai",
        token: Option.none(),
        ci: "false",
        doNotTrack: Option.none(),
        telemetry: Option.none(),
        sshClient: Option.none(),
        sshTty: Option.none(),
        xdgConfigHome: Option.none(),
        claudeSkillsDir: Option.none(),
        geminiCliSkillsDir: Option.none(),
        installInternalSkills: Option.none(),
        vitest: "false",
        home: Option.none(),
        userProfile: Option.none(),
        homePath: Option.none(),
        verbose: Option.none(),
        debug: Option.none(),
        ...opts.configOverrides,
      } satisfies CliEnvConfigService)
    : CliEnvConfig.testDefaults;

  const FullLayer = Layer.mergeAll(CliFlagsTest(), credStoreLayer, registryUrlLayer, configLayer);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
  const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
    effect.pipe(Effect.provide(FullLayer));

  return { provide };
};

describe("auth token handler", () => {
  beforeEach(() => {
    resetEnvVarMessageFlag();
  });

  it.effect("fails with AUTH_LOGIN_REQUIRED when no token", () => {
    const { provide } = makeLayers();
    return provide(
      Effect.gen(function* () {
        const result = yield* handleToken().pipe(
          Effect.catchTag("CliError", (e) =>
            Effect.succeed({ error: true, code: e.code, howToFix: e.howToFix }),
          ),
        );
        expect(result).toMatchObject({ error: true, code: "AUTH_LOGIN_REQUIRED" });
      }),
    );
  });

  it.effect("outputs token from credential store to stdout", () => {
    const { provide } = makeLayers({ hasCredentials: true });
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    return provide(
      Effect.gen(function* () {
        yield* handleToken();
        const output = writeSpy.mock.calls.map((c) => String(c[0])).join("");
        expect(output).toBe("axm_ses_mytoken\n");
        writeSpy.mockRestore();
      }),
    );
  });

  it.effect("outputs token from AXM_TOKEN env var", () => {
    const { provide } = makeLayers({
      configOverrides: { token: Option.some(Redacted.make("axm_env_test_token")) },
    });
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    return provide(
      Effect.gen(function* () {
        yield* handleToken();
        const output = writeSpy.mock.calls.map((c) => String(c[0])).join("");
        expect(output).toBe("axm_env_test_token\n");
        writeSpy.mockRestore();
      }),
    );
  });
});
