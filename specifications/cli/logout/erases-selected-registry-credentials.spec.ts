import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Option from "effect/Option";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { KeychainTest } from "@agentxm/registry-auth/testing";
import {
  CredentialStore,
  RegistryAuthFailed,
  makeCredentialStoreLive,
} from "axm.sh/specification-harness";
import { getAppError, handleLogout, handleToken } from "axm.sh/specification-harness";
import {
  authCredentialFile,
  authRegistry,
  otherAuthRegistry,
  makeAuthSpecContext,
} from "../../support/auth-harness.js";
import { afterEach, beforeEach, vi } from "vitest";
beforeEach(() => {
  vi.stubEnv("AXM_TOKEN", "");
  vi.stubEnv("AXM_TOKEN_FILE", "");
});
afterEach(() => vi.unstubAllEnvs());

export const specification = defineSpecification({
  requirement: "cli/logout/erases-selected-registry-credentials",
  title: "Sign-out removes only the selected Registry session",
  statement:
    "When logout finds saved credentials, AXM shall remove the selected Registry session from every credential storage it can reach on the host even if remote revocation fails, leaving other Registry credentials available.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/auth/logout.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Local sign-out", () => {
  for (const remoteRevoke of ["succeeds", "fails"] as const) {
    it.effect(remoteRevoke, () => {
      const revoked: string[] = [];
      const context = makeAuthSpecContext({
        credentials: authCredentialFile,
        auth: {
          revokeToken: (token) =>
            Effect.gen(function* () {
              revoked.push(token);
              if (remoteRevoke === "fails")
                return yield* new RegistryAuthFailed({
                  category: "auth",
                  detail: "Fixture Registry unavailable",
                });
            }),
        },
      });
      return context.provide(
        Effect.gen(function* () {
          const credentials = yield* CredentialStore;
          const otherBefore = yield* credentials.load(otherAuthRegistry);
          yield* handleLogout();
          expect(revoked).toEqual(["fixture-stored-refresh"]);
          expect(Option.isNone(yield* credentials.load(authRegistry))).toBe(true);
          expect(yield* credentials.load(otherAuthRegistry)).toEqual(otherBefore);
          const missing = yield* handleToken().pipe(Effect.flip);
          expect(getAppError(missing).code).toBe("auth_required");
          expect(context.rendererState.results[0]?.data).toMatchObject({
            result: {
              status: remoteRevoke === "succeeds" ? "logged-out" : "logged-out-local-only",
              registryHost: "registry.example.test",
              handle: "@alice",
            },
          });
          yield* handleLogout();
          expect(context.rendererState.results.at(-1)?.data).toMatchObject({
            result: { status: "not-logged-in" },
          });
          expect(revoked).toHaveLength(1);
        }),
      );
    });
  }
});

describe("Sign-out across credential storage", () => {
  // A session for one Registry can sit in either storage: the restricted file
  // when a container or remote session wrote it, the keychain when a local one
  // did. Clearing only the tier the current run would write leaves a live
  // session behind and reports a sign-out that did not happen.
  for (const tier of ["keychain", "restricted-file"] as const) {
    it.effect(`clears both storages when the run uses the ${tier} tier`, () => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), "axm-logout-home-"));
      vi.stubEnv("AXM_USER_HOME", home);
      const handle = normalizeHandle("@alice");
      const credentials = {
        access_token: "fixture-access",
        refresh_token: "fixture-refresh",
        expires_at: DateTime.makeUnsafe("2099-01-01T00:00:00.000Z"),
      };
      const keychain = KeychainTest();
      const platform = Layer.mergeAll(NodeServices.layer, keychain.layer);
      const store = (selected: "keychain" | "restricted-file") =>
        Layer.provide(makeCredentialStoreLive(selected), platform);
      return Effect.gen(function* () {
        for (const written of ["keychain", "restricted-file"] as const) {
          yield* Effect.flatMap(CredentialStore, (credentialStore) =>
            credentialStore.save(authRegistry, handle, credentials),
          ).pipe(Effect.provide(store(written)));
        }

        yield* Effect.flatMap(CredentialStore, (credentialStore) =>
          credentialStore.clear(authRegistry),
        ).pipe(Effect.provide(store(tier)));

        for (const remaining of ["keychain", "restricted-file"] as const) {
          const found = yield* Effect.flatMap(CredentialStore, (credentialStore) =>
            credentialStore.load(authRegistry),
          ).pipe(Effect.provide(store(remaining)));
          expect(Option.isNone(found)).toBe(true);
        }
      }).pipe(
        Effect.ensuring(Effect.sync(() => fs.rmSync(home, { recursive: true, force: true }))),
      );
    });
  }
});
