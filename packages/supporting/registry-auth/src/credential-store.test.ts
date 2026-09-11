/**
 * Unit tests for CredentialStore service.
 */

import { describe, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { expect } from "vitest";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  CredentialStore,
  CredentialStoreSessionLive,
  CredentialStoreTest,
  type CredentialStoreService,
  type EnvironmentInfo,
  canUsePersistedCredentials,
  resolveCredentialHomeDir,
  selectTier,
} from "./credential-store.js";
import { RegistryAuthFailed } from "./errors.js";
import type { StoredCredentials } from "./schema.js";

describe("CredentialStore", () => {
  it("prefers AXM_USER_HOME for restricted file placement", () => {
    expect(
      resolveCredentialHomeDir({
        axmUserHome: Option.some("/isolated"),
        home: Option.some("/real-home"),
        userProfile: Option.none(),
        homePath: Option.none(),
      }),
    ).toBe("/isolated");
  });

  describe("CredentialStoreTest (in-memory)", () => {
    const registryUrl = "https://registry.agentxm.ai";
    const credentials = {
      access_token: "axm_ses_abc",
      refresh_token: "axm_ref_def",
      expires_at: DateTime.makeUnsafe("2026-03-12T10:30:00Z"),
    };

    it.effect("returns none when no credentials exist", () => {
      const layer = CredentialStoreTest();
      return Effect.gen(function* () {
        const store = yield* CredentialStore;
        const result = yield* store.load(registryUrl);
        expect(Option.isNone(result)).toBe(true);
      }).pipe(Effect.provide(layer));
    });

    it.effect("saves and loads credentials", () => {
      const layer = CredentialStoreTest();
      return Effect.gen(function* () {
        const store = yield* CredentialStore;
        yield* store.save(registryUrl, normalizeHandle("@alice"), credentials);
        const result = yield* store.load(registryUrl);
        expect(Option.isSome(result)).toBe(true);
        if (Option.isSome(result)) {
          expect(result.value.handle).toBe("@alice");
          expect(result.value.access_token).toBe("axm_ses_abc");
          expect(result.value.refresh_token).toBe("axm_ref_def");
          expect(DateTime.formatIso(result.value.expires_at)).toBe("2026-03-12T10:30:00.000Z");
        }
      }).pipe(Effect.provide(layer));
    });

    it.effect("clears credentials for a registry", () => {
      const layer = CredentialStoreTest();
      return Effect.gen(function* () {
        const store = yield* CredentialStore;
        yield* store.save(registryUrl, normalizeHandle("@alice"), credentials);
        yield* store.clear(registryUrl);
        const result = yield* store.load(registryUrl);
        expect(Option.isNone(result)).toBe(true);
      }).pipe(Effect.provide(layer));
    });

    it.effect("deactivates previous accounts on save", () => {
      const layer = CredentialStoreTest();
      return Effect.gen(function* () {
        const store = yield* CredentialStore;
        yield* store.save(registryUrl, normalizeHandle("@alice"), credentials);
        yield* store.save(registryUrl, normalizeHandle("@bob"), {
          ...credentials,
          access_token: "axm_ses_bob",
        });
        const result = yield* store.load(registryUrl);
        expect(Option.isSome(result)).toBe(true);
        if (Option.isSome(result)) {
          expect(result.value.handle).toBe("@bob");
          expect(result.value.access_token).toBe("axm_ses_bob");
        }
      }).pipe(Effect.provide(layer));
    });

    it.effect("keeps separate registries independent", () => {
      const layer = CredentialStoreTest();
      const otherUrl = "https://registry.corp.com";
      return Effect.gen(function* () {
        const store = yield* CredentialStore;
        yield* store.save(registryUrl, normalizeHandle("@alice"), credentials);
        yield* store.save(otherUrl, normalizeHandle("@bob"), {
          ...credentials,
          access_token: "axm_ses_bob",
        });
        const result1 = yield* store.load(registryUrl);
        const result2 = yield* store.load(otherUrl);
        expect(Option.isSome(result1)).toBe(true);
        expect(Option.isSome(result2)).toBe(true);
        if (Option.isSome(result1) && Option.isSome(result2)) {
          expect(result1.value.handle).toBe("@alice");
          expect(result2.value.handle).toBe("@bob");
        }
      }).pipe(Effect.provide(layer));
    });

    it.effect("reports the configured tier", () => {
      const layer = CredentialStoreTest("plaintext-file");
      return Effect.gen(function* () {
        const store = yield* CredentialStore;
        expect(store.tier).toBe("plaintext-file");
      }).pipe(Effect.provide(layer));
    });

    it.effect("fails save when persisted credentials are disabled", () => {
      const layer = CredentialStoreTest("restricted-file", undefined, false);
      return Effect.gen(function* () {
        const store = yield* CredentialStore;
        const result = yield* store
          .save(registryUrl, normalizeHandle("@alice"), credentials)
          .pipe(Effect.catchTag("AuthTokenPolicyRequired", (error) => Effect.succeed(error._tag)));
        expect(result).toBe("AuthTokenPolicyRequired");
      }).pipe(Effect.provide(layer));
    });

    it.effect("clear is a no-op when no credentials exist", () => {
      const layer = CredentialStoreTest();
      return Effect.gen(function* () {
        const store = yield* CredentialStore;
        yield* store.clear(registryUrl);
        const result = yield* store.load(registryUrl);
        expect(Option.isNone(result)).toBe(true);
      }).pipe(Effect.provide(layer));
    });
  });

  describe("CredentialStoreSessionLive (per-origin read memo)", () => {
    const originA = "https://registry.agentxm.ai";
    const originB = "https://registry.example.test";

    const credentialsFor = (token: string) => ({
      access_token: token,
      refresh_token: `${token}_refresh`,
      expires_at: DateTime.makeUnsafe("2026-03-12T10:30:00Z"),
    });

    const loadFailure = () =>
      new RegistryAuthFailed({ category: "auth", detail: "credential read failed" });

    /**
     * A credential store whose loads are counted and, optionally, redirected to
     * a controlled effect. Backing state is a plain map so the memo — not the
     * store — is what the assertions observe.
     */
    const makeRecordingStore = () => {
      const loadCounts = new Map<string, number>();
      const stored = new Map<string, StoredCredentials>();
      let loadOverride:
        | ((
            registryUrl: string,
          ) => Effect.Effect<Option.Option<StoredCredentials>, RegistryAuthFailed>)
        | undefined;

      const service: CredentialStoreService = {
        tier: "restricted-file",
        allowsPersistedCredentials: true,
        load: (registryUrl) =>
          Effect.suspend(() => {
            loadCounts.set(registryUrl, (loadCounts.get(registryUrl) ?? 0) + 1);
            if (loadOverride !== undefined) return loadOverride(registryUrl);
            const found = stored.get(registryUrl);
            return Effect.succeed(found === undefined ? Option.none() : Option.some(found));
          }),
        save: (registryUrl, handle, credentials) =>
          Effect.sync(() => {
            stored.set(registryUrl, { handle, ...credentials });
          }),
        clear: (registryUrl) =>
          Effect.sync(() => {
            stored.delete(registryUrl);
          }),
      };

      return {
        layer: Layer.provide(CredentialStoreSessionLive, Layer.succeed(CredentialStore, service)),
        loadCount: (registryUrl: string) => loadCounts.get(registryUrl) ?? 0,
        seed: (registryUrl: string, token: string) => {
          stored.set(registryUrl, { handle: normalizeHandle("@alice"), ...credentialsFor(token) });
        },
        overrideLoad: (
          override: (
            registryUrl: string,
          ) => Effect.Effect<Option.Option<StoredCredentials>, RegistryAuthFailed>,
        ) => {
          loadOverride = override;
        },
        restoreLoad: () => {
          loadOverride = undefined;
        },
      };
    };

    const accessToken = (result: Option.Option<StoredCredentials>) =>
      Option.map(result, (credentials) => credentials.access_token);

    it.effect("memoizes a successful empty read for the session", () => {
      const backing = makeRecordingStore();
      return Effect.gen(function* () {
        const store = yield* CredentialStore;
        const first = yield* store.load(originA);
        const second = yield* store.load(originA);
        expect(Option.isNone(first)).toBe(true);
        expect(Option.isNone(second)).toBe(true);
        expect(backing.loadCount(originA)).toBe(1);
      }).pipe(Effect.provide(backing.layer));
    });

    it.effect("shares one in-flight lookup across concurrent misses on one origin", () => {
      const backing = makeRecordingStore();
      backing.seed(originA, "axm_ses_shared");
      return Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        backing.overrideLoad(() =>
          Effect.gen(function* () {
            yield* Deferred.succeed(started, undefined);
            yield* Deferred.await(release);
            return Option.some({
              handle: normalizeHandle("@alice"),
              ...credentialsFor("axm_ses_shared"),
            });
          }),
        );

        const store = yield* CredentialStore;
        const readers = yield* Effect.forkChild(
          Effect.all([store.load(originA), store.load(originA), store.load(originA)], {
            concurrency: "unbounded",
          }),
        );

        yield* Deferred.await(started);
        yield* Deferred.succeed(release, undefined);
        const results = yield* Fiber.await(readers);

        expect(results._tag).toBe("Success");
        expect(backing.loadCount(originA)).toBe(1);
      }).pipe(Effect.provide(backing.layer));
    });

    it.effect("keeps origins isolated", () => {
      const backing = makeRecordingStore();
      backing.seed(originA, "axm_ses_a");
      backing.seed(originB, "axm_ses_b");
      return Effect.gen(function* () {
        const store = yield* CredentialStore;
        expect(accessToken(yield* store.load(originA))).toEqual(Option.some("axm_ses_a"));
        expect(accessToken(yield* store.load(originB))).toEqual(Option.some("axm_ses_b"));
        expect(backing.loadCount(originA)).toBe(1);
        expect(backing.loadCount(originB)).toBe(1);
      }).pipe(Effect.provide(backing.layer));
    });

    it.effect("retries a failed read on the next request", () => {
      const backing = makeRecordingStore();
      return Effect.gen(function* () {
        backing.overrideLoad(() => Effect.fail(loadFailure()));
        const store = yield* CredentialStore;

        const first = yield* Effect.exit(store.load(originA));
        expect(first._tag).toBe("Failure");
        expect(backing.loadCount(originA)).toBe(1);

        const second = yield* Effect.exit(store.load(originA));
        expect(second._tag).toBe("Failure");
        expect(backing.loadCount(originA)).toBe(2);

        // A later success is reachable and then memoized.
        backing.restoreLoad();
        backing.seed(originA, "axm_ses_recovered");
        expect(accessToken(yield* store.load(originA))).toEqual(Option.some("axm_ses_recovered"));
        expect(backing.loadCount(originA)).toBe(3);
        yield* store.load(originA);
        expect(backing.loadCount(originA)).toBe(3);
      }).pipe(Effect.provide(backing.layer));
    });

    it.effect("never memoizes a failure, for concurrent or later callers", () => {
      const backing = makeRecordingStore();
      return Effect.gen(function* () {
        backing.overrideLoad(() => Effect.fail(loadFailure()));
        const store = yield* CredentialStore;

        const concurrent = yield* Effect.all(
          [
            Effect.exit(store.load(originA)),
            Effect.exit(store.load(originA)),
            Effect.exit(store.load(originA)),
          ],
          { concurrency: "unbounded" },
        );
        expect(concurrent.map((exit) => exit._tag)).toEqual(["Failure", "Failure", "Failure"]);

        // Nothing about the failure is retained: the next read reaches the store.
        backing.restoreLoad();
        backing.seed(originA, "axm_ses_recovered");
        expect(accessToken(yield* store.load(originA))).toEqual(Option.some("axm_ses_recovered"));
      }).pipe(Effect.provide(backing.layer));
    });

    it.effect("invalidates only the saved origin", () => {
      const backing = makeRecordingStore();
      backing.seed(originA, "axm_ses_a");
      backing.seed(originB, "axm_ses_b");
      return Effect.gen(function* () {
        const store = yield* CredentialStore;
        yield* store.load(originA);
        yield* store.load(originB);

        yield* store.save(originA, normalizeHandle("@alice"), credentialsFor("axm_ses_a2"));

        expect(accessToken(yield* store.load(originA))).toEqual(Option.some("axm_ses_a2"));
        expect(accessToken(yield* store.load(originB))).toEqual(Option.some("axm_ses_b"));
        expect(backing.loadCount(originA)).toBe(2);
        expect(backing.loadCount(originB)).toBe(1);
      }).pipe(Effect.provide(backing.layer));
    });

    it.effect("invalidates only the cleared origin", () => {
      const backing = makeRecordingStore();
      backing.seed(originA, "axm_ses_a");
      backing.seed(originB, "axm_ses_b");
      return Effect.gen(function* () {
        const store = yield* CredentialStore;
        yield* store.load(originA);
        yield* store.load(originB);

        yield* store.clear(originA);

        expect(Option.isNone(yield* store.load(originA))).toBe(true);
        expect(accessToken(yield* store.load(originB))).toEqual(Option.some("axm_ses_b"));
        expect(backing.loadCount(originA)).toBe(2);
        expect(backing.loadCount(originB)).toBe(1);
      }).pipe(Effect.provide(backing.layer));
    });

    for (const operation of ["save", "clear"] as const) {
      for (const timing of ["during lookup startup", "after lookup insertion"] as const) {
        it.effect(`${operation} invalidation survives ${timing}`, () => {
          const backing = makeRecordingStore();
          backing.seed(originA, "axm_ses_old");
          backing.seed(originB, "axm_ses_other");
          return Effect.gen(function* () {
            const store = yield* CredentialStore;
            yield* store.load(originB);
            const started = yield* Deferred.make<void>();
            const release = yield* Deferred.make<void>();
            backing.overrideLoad(() =>
              Effect.gen(function* () {
                yield* Deferred.succeed(started, undefined);
                yield* Deferred.await(release);
                return Option.some({
                  handle: normalizeHandle("@alice"),
                  ...credentialsFor("axm_ses_old"),
                });
              }),
            );
            const reader = yield* Effect.forkChild(store.load(originA));
            yield* Deferred.await(started);
            // Deferred wakes this waiting fiber synchronously from the lookup.
            // Yielding lets Cache.get insert its pending entry before the write.
            if (timing === "after lookup insertion") yield* Effect.yieldNow;
            if (operation === "save") {
              yield* store.save(originA, normalizeHandle("@alice"), credentialsFor("axm_ses_new"));
            } else {
              yield* store.clear(originA);
            }
            backing.restoreLoad();
            const expected = operation === "save" ? Option.some("axm_ses_new") : Option.none();
            expect(accessToken(yield* store.load(originA))).toEqual(expected);
            yield* Deferred.succeed(release, undefined);
            expect(accessToken(yield* Fiber.join(reader))).toEqual(Option.some("axm_ses_old"));
            expect(accessToken(yield* store.load(originA))).toEqual(expected);
            expect(backing.loadCount(originA)).toBe(2);
            expect(accessToken(yield* store.load(originB))).toEqual(Option.some("axm_ses_other"));
            expect(backing.loadCount(originB)).toBe(1);
          }).pipe(Effect.provide(backing.layer));
        });
      }
    }

    it.effect("an interrupted read leaves the memo reusable", () => {
      const backing = makeRecordingStore();
      return Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        const blocked = yield* Deferred.make<void>();
        backing.overrideLoad(() =>
          Effect.gen(function* () {
            yield* Deferred.succeed(started, undefined);
            yield* Deferred.await(blocked);
            return Option.none<StoredCredentials>();
          }),
        );

        const store = yield* CredentialStore;
        const reader = yield* Effect.forkChild(store.load(originA));
        yield* Deferred.await(started);
        yield* Fiber.interrupt(reader);

        // The abandoned read must not be left in the memo for the next caller
        // to await. `blocked` is never opened, so a retained entry would hang.
        backing.restoreLoad();
        backing.seed(originA, "axm_ses_after_interrupt");
        expect(accessToken(yield* store.load(originA))).toEqual(
          Option.some("axm_ses_after_interrupt"),
        );
        expect(backing.loadCount(originA)).toBe(2);
      }).pipe(Effect.provide(backing.layer));
    });
  });

  describe("selectTier", () => {
    const baseEnv: EnvironmentInfo = {
      isSSH: false,
      isContainer: false,
      isWSL: false,
      isCI: false,
      isRoot: false,
      isGenericBunExecutable: false,
    };

    it("selects keychain for default environment", () => {
      expect(selectTier(baseEnv)).toBe("keychain");
    });

    it("selects restricted-file for container environment", () => {
      expect(selectTier({ ...baseEnv, isContainer: true })).toBe("restricted-file");
    });

    it("selects restricted-file for CI environment", () => {
      expect(selectTier({ ...baseEnv, isCI: true })).toBe("restricted-file");
    });

    it("selects restricted-file for SSH environment", () => {
      expect(selectTier({ ...baseEnv, isSSH: true })).toBe("restricted-file");
    });

    it("selects restricted-file for the generic Bun development executable", () => {
      expect(selectTier({ ...baseEnv, isGenericBunExecutable: true })).toBe("restricted-file");
    });

    it("selects keychain for WSL desktop environments", () => {
      expect(selectTier({ ...baseEnv, isWSL: true })).toBe("keychain");
    });

    it("container takes precedence over SSH", () => {
      expect(selectTier({ ...baseEnv, isContainer: true, isSSH: true })).toBe("restricted-file");
    });

    it("container takes precedence over CI", () => {
      expect(selectTier({ ...baseEnv, isContainer: true, isCI: true })).toBe("restricted-file");
    });
  });

  describe("canUsePersistedCredentials", () => {
    const baseEnv: EnvironmentInfo = {
      isSSH: false,
      isContainer: false,
      isWSL: false,
      isCI: false,
      isRoot: false,
      isGenericBunExecutable: false,
    };

    it("allows persisted credentials in normal local environments", () => {
      expect(canUsePersistedCredentials(baseEnv)).toBe(true);
    });

    it("disables persisted credentials in CI", () => {
      expect(canUsePersistedCredentials({ ...baseEnv, isCI: true })).toBe(false);
    });

    it("allows restricted-file credentials in containers for agent sessions", () => {
      expect(canUsePersistedCredentials({ ...baseEnv, isContainer: true })).toBe(true);
    });
  });
});
