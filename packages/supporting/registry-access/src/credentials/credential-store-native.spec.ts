import { defineSpecification } from "@agentxm/specification-metadata";
import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as ConfigProvider from "effect/ConfigProvider";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Logger from "effect/Logger";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions/handle";
import { AuthEnvironment } from "../adapters/environment.js";
import {
  CredentialStore,
  CredentialStoreLive,
  KeyringEntryLoader,
  KeyringUnavailable,
} from "./credential-store.js";
import { credentialFileFixture, credentialKeyOf } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/credentials/native-keychain-packaging",
  title: "Standalone Apple desktop credentials use the native keychain with diagnosable fallback",
  statement:
    "Supported standalone Apple desktop binaries shall write, read, and delete credentials through an accessible OS keychain without file fallback, while module-load and keychain-access failures shall carry distinct sanitized reasons and preserve restricted-file fallback integrity.",
  class: "functional",
  role: "supporting",
  goals: ["platform-reach", "actionable-diagnostics"],
  boundary: "platform",
  boundaryRationale:
    "The adapter examples use a real restricted credential file and an injected native entry loader; binary-bound examples exercise the packaged native addon against a disposable macOS keychain.",
  methods: ["example"],
  derivedFrom: ["packages/supporting/registry-access/src/credentials/credential-store.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const registry = credentialKeyOf("https://registry.example.test");
const otherRegistry = credentialKeyOf("https://other.example.test");
const handle = normalizeHandle("@alice");
const credentials = {
  access_token: "fixture-access",
  refresh_token: "fixture-refresh",
  expires_at: DateTime.makeUnsafe("2030-01-01T00:00:00Z"),
};

const keychainFixture = (loadFailure = false) =>
  Effect.gen(function* () {
    const fixture = yield* credentialFileFixture;
    const entries = new Map<string, string>();
    const unavailable = new Set<"read" | "write" | "delete">();
    class Entry {
      constructor(
        readonly service: string,
        readonly account: string,
      ) {}
      getPassword() {
        if (unavailable.has("read")) throw new Error("fixture-sensitive-native-payload");
        return entries.get(this.account) ?? null;
      }
      setPassword(value: string) {
        if (unavailable.has("write")) throw new Error("fixture-sensitive-native-payload");
        entries.set(this.account, value);
      }
      deletePassword() {
        if (unavailable.has("delete")) throw new Error("fixture-sensitive-native-payload");
        return entries.delete(this.account);
      }
    }
    const hostFs: FileSystem.FileSystem = {
      ...fixture.fs,
      exists: (path) =>
        ["/.dockerenv", "/.containerenv", "/proc/version"].includes(path)
          ? Effect.succeed(false)
          : fixture.fs.exists(path),
    };
    const layer = Layer.fresh(CredentialStoreLive).pipe(
      Layer.provide(
        Layer.mergeAll(
          Layer.succeed(
            AuthEnvironment,
            ConfigProvider.fromEnvRecord({ AXM_USER_HOME: fixture.home }),
          ),
          Layer.succeed(
            KeyringEntryLoader,
            loadFailure
              ? Effect.fail(new KeyringUnavailable({ reason: "module-load-failed" }))
              : Effect.succeed(Entry),
          ),
          Layer.succeed(FileSystem.FileSystem, hostFs),
        ),
      ),
    );
    return { ...fixture, nativeLayer: layer, entries, unavailable };
  });

describe("Credential keychain and restricted-file ownership", () => {
  for (const reason of ["module-load-failed", "keychain-access-failed"] as const) {
    it.live(
      `identifies ${reason} without exposing native payloads and preserves secure fallback`,
      () =>
        Effect.gen(function* () {
          const fixture = yield* keychainFixture(reason === "module-load-failed");
          fixture.unavailable.add("read");
          fixture.unavailable.add("write");
          const messages: Array<unknown> = [];
          const logger = Logger.make((entry) => {
            messages.push(entry.message);
          });
          yield* Effect.gen(function* () {
            const store = yield* CredentialStore;
            yield* store.save(registry, handle, credentials);
            expect(Option.getOrThrow(yield* store.load(registry)).access_token).toBe(
              credentials.access_token,
            );
          }).pipe(Effect.provide(Layer.merge(fixture.nativeLayer, Logger.layer([logger]))));
          expect(JSON.stringify(messages)).toContain(`OS keychain unavailable (${reason})`);
          expect(JSON.stringify(messages)).not.toContain("fixture-sensitive-native-payload");
          expect(JSON.stringify(messages)).not.toContain(credentials.access_token);
          expect((yield* fixture.fs.stat(fixture.file)).mode & 0o777).toBe(0o600);
        }).pipe(Effect.provide(NodeServices.layer)),
    );
  }

  it.live("does not include token values in a credential decoding failure", () =>
    Effect.gen(function* () {
      const fixture = yield* credentialFileFixture;
      const content = JSON.stringify({
        version: 1,
        registries: {
          [registry]: {
            accounts: {
              [handle]: {
                access_token: "fixture-sensitive-access",
                refresh_token: "fixture-sensitive-refresh",
                expires_at: false,
                active: true,
              },
            },
          },
        },
      });
      yield* fixture.fs.writeFileString(fixture.file, content, { mode: 0o600 });
      const error = yield* Effect.flatMap(CredentialStore, (store) => store.load(registry)).pipe(
        Effect.provide(fixture.layer),
        Effect.flip,
      );
      expect(error).toMatchObject({
        _tag: "RegistryAccessFailed",
        detail: "Failed to parse credential file",
      });
      expect(JSON.stringify(error)).not.toContain("fixture-sensitive");
      expect(yield* fixture.fs.readFileString(fixture.file)).toBe(content);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.live("moves only the selected Registry to the keychain", () =>
    Effect.gen(function* () {
      const fixture = yield* keychainFixture();
      yield* Effect.gen(function* () {
        const store = yield* CredentialStore;
        yield* store.save(registry, handle, credentials);
        yield* store.save(otherRegistry, handle, credentials);
      }).pipe(Effect.provide(fixture.layer));
      yield* Effect.gen(function* () {
        const store = yield* CredentialStore;
        expect(store.tier).toBe("keychain");
        yield* store.save(registry, handle, { ...credentials, access_token: "new-access" });
        expect(Option.getOrThrow(yield* store.load(registry)).access_token).toBe("new-access");
        expect(Option.getOrThrow(yield* store.load(otherRegistry)).access_token).toBe(
          credentials.access_token,
        );
      }).pipe(Effect.provide(fixture.nativeLayer));
      yield* Effect.gen(function* () {
        const store = yield* CredentialStore;
        expect(Option.isNone(yield* store.load(registry))).toBe(true);
        expect(Option.getOrThrow(yield* store.load(otherRegistry)).access_token).toBe(
          credentials.access_token,
        );
      }).pipe(Effect.provide(fixture.layer));
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.live("keeps the unavailable-keychain fallback without replacing another Registry", () =>
    Effect.gen(function* () {
      const fixture = yield* keychainFixture();
      yield* Effect.flatMap(CredentialStore, (store) =>
        store.save(otherRegistry, handle, credentials),
      ).pipe(Effect.provide(fixture.layer));
      fixture.unavailable.add("read");
      fixture.unavailable.add("write");
      yield* Effect.gen(function* () {
        const store = yield* CredentialStore;
        yield* store.save(registry, handle, credentials);
        for (const origin of [registry, otherRegistry])
          expect(Option.isSome(yield* store.load(origin))).toBe(true);
      }).pipe(Effect.provide(fixture.nativeLayer));
      expect((yield* fixture.fs.stat(fixture.file)).mode & 0o777).toBe(0o600);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.live("reports a failed keychain deletion and preserves fallback credentials", () =>
    Effect.gen(function* () {
      const fixture = yield* keychainFixture();
      yield* Effect.flatMap(CredentialStore, (store) =>
        store.save(registry, handle, credentials),
      ).pipe(Effect.provide(fixture.nativeLayer));
      yield* Effect.flatMap(CredentialStore, (store) =>
        store.save(otherRegistry, handle, credentials),
      ).pipe(Effect.provide(fixture.layer));
      const committedFile = yield* fixture.fs.readFileString(fixture.file);
      const committedKeychain = fixture.entries.get(`registry:${registry}`);
      fixture.unavailable.add("delete");
      const error = yield* Effect.flatMap(CredentialStore, (store) => store.clear(registry)).pipe(
        Effect.provide(fixture.nativeLayer),
        Effect.flip,
      );
      expect(error).toMatchObject({
        _tag: "RegistryAccessFailed",
        category: "auth",
        detail: "Failed to delete OS keychain credentials",
      });
      expect(fixture.entries.get(`registry:${registry}`)).toBe(committedKeychain);
      expect(yield* fixture.fs.readFileString(fixture.file)).toBe(committedFile);
      fixture.unavailable.delete("delete");
      yield* Effect.gen(function* () {
        const store = yield* CredentialStore;
        yield* store.clear(registry);
        expect(Option.isNone(yield* store.load(registry))).toBe(true);
        expect(Option.isSome(yield* store.load(otherRegistry))).toBe(true);
      }).pipe(Effect.provide(fixture.nativeLayer));
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.live("clears file credentials when the keychain entry is already absent", () =>
    Effect.gen(function* () {
      const fixture = yield* keychainFixture();
      yield* Effect.flatMap(CredentialStore, (store) =>
        store.save(registry, handle, credentials),
      ).pipe(Effect.provide(fixture.layer));
      yield* Effect.gen(function* () {
        const store = yield* CredentialStore;
        yield* store.clear(registry);
        yield* store.clear(registry);
        expect(Option.isNone(yield* store.load(registry))).toBe(true);
      }).pipe(Effect.provide(fixture.nativeLayer));
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.live("reports an undecodable keychain value instead of selecting another credential", () =>
    Effect.gen(function* () {
      const fixture = yield* keychainFixture();
      fixture.entries.set(`registry:${registry}`, "{");
      const error = yield* Effect.flatMap(CredentialStore, (store) => store.load(registry)).pipe(
        Effect.provide(fixture.nativeLayer),
        Effect.flip,
      );
      expect(error).toMatchObject({
        _tag: "RegistryAccessFailed",
        detail: "Failed to parse OS keychain credentials",
      });
      expect(fixture.entries.get(`registry:${registry}`)).toBe("{");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.live("refuses a keychain write before touching an undecodable fallback file", () =>
    Effect.gen(function* () {
      const fixture = yield* keychainFixture();
      yield* fixture.fs.writeFileString(fixture.file, "{", { mode: 0o600 });
      const error = yield* Effect.flatMap(CredentialStore, (store) =>
        store.save(registry, handle, credentials),
      ).pipe(Effect.provide(fixture.nativeLayer), Effect.flip);
      expect(error).toMatchObject({
        _tag: "RegistryAccessFailed",
        detail: "Failed to parse credential file",
      });
      expect(fixture.entries.size).toBe(0);
      expect(yield* fixture.fs.readFileString(fixture.file)).toBe("{");
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
