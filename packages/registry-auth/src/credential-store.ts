/**
 * CredentialStore Effect service — credential storage and auth policy.
 *
 * Tier 1: OS keychain (@napi-rs/keyring)
 * Tier 2: Restricted-permission file (~/.config/axm/credentials.json)
 *
 * CI environments are token-only by policy. Containers use the restricted
 * file tier so agent sessions can complete resumable device authorization.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import type * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as lockfile from "proper-lockfile";
import { decodeHandleSync, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import { AuthTokenPolicyRequired, RegistryAuthFailed } from "./errors.js";
import { envOption, isCI, isContainer, isRoot, isSSH, isWSL } from "./internal/environment.js";
import type { CredentialEntry, CredentialFile, StorageTier, StoredCredentials } from "./schema.js";
import { CredentialFileSchema } from "./schema.js";

const decodeCredentialFileFromJsonString = Schema.decodeUnknownEffect(
  Schema.fromJsonString(CredentialFileSchema),
);

// -----------------------------------------------------------------------------
// Service interface
// -----------------------------------------------------------------------------

export interface CredentialStoreService {
  readonly save: (
    registryUrl: string,
    handle: Handle,
    credentials: {
      readonly access_token: string;
      readonly refresh_token: string;
      readonly expires_at: DateTime.Utc;
    },
  ) => Effect.Effect<void, RegistryAuthFailed | AuthTokenPolicyRequired>;
  readonly load: (
    registryUrl: string,
  ) => Effect.Effect<Option.Option<StoredCredentials>, RegistryAuthFailed>;
  readonly clear: (registryUrl: string) => Effect.Effect<void, RegistryAuthFailed>;
  readonly tier: StorageTier;
  readonly allowsPersistedCredentials: boolean;
}

export class CredentialStore extends ServiceMap.Service<CredentialStore, CredentialStoreService>()(
  "@agentxm/registry-auth/credential-store/CredentialStore",
) {}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const CREDENTIALS_FILENAME = "credentials.json";
const CONFIG_DIR_NAME = "axm";
const DIR_PERMISSIONS = 0o700;
const FILE_PERMISSIONS = 0o600;
const KEYCHAIN_SERVICE = "axm";

type KeyringEntry = {
  readonly getPassword: () => string | null;
  readonly setPassword: (password: string) => void;
  readonly deletePassword: () => void;
};

type KeyringEntryConstructor = new (service: string, account: string) => KeyringEntry;

type KeyringModule = {
  readonly Entry: KeyringEntryConstructor;
};

const keyringModuleSpecifier = ["@napi-rs", "keyring"].join("/");

const loadKeyringEntry = Effect.tryPromise({
  try: async () => {
    const keyring: KeyringModule = await import(keyringModuleSpecifier);
    return keyring.Entry;
  },
  catch: (error) =>
    new RegistryAuthFailed({
      category: "auth",
      detail: "OS keychain module could not be loaded",
      cause: error,
    }),
});

// -----------------------------------------------------------------------------
// Internal helpers (take fs/path as args to avoid context leakage)
// -----------------------------------------------------------------------------

export const resolveCredentialHomeDir = (config: {
  readonly axmUserHome: Option.Option<string>;
  readonly home: Option.Option<string>;
  readonly userProfile: Option.Option<string>;
  readonly homePath: Option.Option<string>;
}): string =>
  Option.getOrElse(
    Option.orElse(config.axmUserHome, () =>
      Option.orElse(
        Option.orElse(config.home, () => config.userProfile),
        () => config.homePath,
      ),
    ),
    () => "/tmp",
  );

const getCredentialsDir = (path: Path.Path, homeDir: string) => {
  return path.join(homeDir, ".config", CONFIG_DIR_NAME);
};

const getCredentialsPath = (path: Path.Path, homeDir: string) =>
  path.join(getCredentialsDir(path, homeDir), CREDENTIALS_FILENAME);

const ensureCredentialsDir = (fs: FileSystem.FileSystem, path: Path.Path, homeDir: string) =>
  Effect.gen(function* () {
    const dir = getCredentialsDir(path, homeDir);
    const exists = yield* fs.exists(dir).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) {
      yield* fs.makeDirectory(dir, { recursive: true }).pipe(
        Effect.mapError(
          (error) =>
            new RegistryAuthFailed({
              category: "auth",
              detail: `Failed to create credentials directory: ${dir}`,
              suggestions: [{ description: `Ensure you have write access to ~/.config/` }],
              cause: error,
            }),
        ),
      );
      yield* fs.chmod(dir, DIR_PERMISSIONS).pipe(Effect.catch(() => Effect.void));
    }
  });

const checkFilePermissions = (fs: FileSystem.FileSystem, filePath: string) =>
  fs.stat(filePath).pipe(
    Effect.map((stat) => (stat.mode & 0o777) > FILE_PERMISSIONS),
    Effect.catch(() => Effect.succeed(false)),
  );

const setFilePermissions = (fs: FileSystem.FileSystem, filePath: string) =>
  fs.chmod(filePath, FILE_PERMISSIONS).pipe(Effect.catch(() => Effect.void));

const withCredentialFileLock = <A, E, R>(
  fs: FileSystem.FileSystem,
  path: Path.Path,
  homeDir: string,
  effect: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    yield* ensureCredentialsDir(fs, path, homeDir);
    const dir = getCredentialsDir(path, homeDir);
    const release = yield* Effect.tryPromise({
      try: () => lockfile.lock(dir, { retries: { retries: 5, minTimeout: 25, maxTimeout: 100 } }),
      catch: (error) =>
        new RegistryAuthFailed({
          category: "auth",
          detail: "Could not lock credential storage",
          cause: error,
        }),
    });

    return yield* effect.pipe(
      Effect.ensuring(
        Effect.tryPromise({
          try: () => release(),
          catch: () => undefined,
        }).pipe(Effect.catch(() => Effect.void)),
      ),
    );
  });

const readCredentialFile = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  homeDir: string,
): Effect.Effect<Option.Option<CredentialFile>, RegistryAuthFailed> =>
  Effect.gen(function* () {
    const filePath = getCredentialsPath(path, homeDir);
    const exists = yield* fs.exists(filePath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) return Option.none<CredentialFile>();

    const overly = yield* checkFilePermissions(fs, filePath);
    if (overly) {
      yield* Effect.logWarning("Credential file has overly permissive permissions.");
    }

    const content = yield* fs.readFileString(filePath).pipe(
      Effect.mapError(
        (error) =>
          new RegistryAuthFailed({
            category: "auth",
            detail: "Credential file could not be read",
            cause: error,
          }),
      ),
    );

    return yield* decodeCredentialFileFromJsonString(content).pipe(
      Effect.map((file) => Option.some(file)),
      Effect.mapError(
        (error) =>
          new RegistryAuthFailed({
            category: "auth",
            detail: "Failed to parse credential file",
            suggestions: [
              {
                description: "The credential file may be corrupt. Delete it and sign in again.",
                cmd: "axm login",
              },
            ],
            cause: error,
          }),
      ),
      Effect.catch(() =>
        Effect.logWarning("Credential file failed schema validation, treating as empty.").pipe(
          Effect.map(() => Option.none<CredentialFile>()),
        ),
      ),
    );
  });

const deleteCredentialFile = (fs: FileSystem.FileSystem, path: Path.Path, homeDir: string) =>
  Effect.gen(function* () {
    const filePath = getCredentialsPath(path, homeDir);
    const exists = yield* fs.exists(filePath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (exists) {
      yield* fs.remove(filePath).pipe(Effect.catch(() => Effect.void));
    }
  });

const writeCredentialFile = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  homeDir: string,
  data: CredentialFile,
): Effect.Effect<void, RegistryAuthFailed> =>
  Effect.gen(function* () {
    yield* ensureCredentialsDir(fs, path, homeDir);
    const filePath = getCredentialsPath(path, homeDir);
    const encoded = yield* Schema.encodeEffect(CredentialFileSchema)(data).pipe(
      Effect.mapError(
        (error) =>
          new RegistryAuthFailed({
            category: "auth",
            detail: "Failed to encode credential file",
            cause: error,
          }),
      ),
    );
    const content = JSON.stringify(encoded, null, 2);
    yield* fs.writeFileString(filePath, content).pipe(
      Effect.mapError(
        (error) =>
          new RegistryAuthFailed({
            category: "auth",
            detail: "Failed to write credential file",
            cause: error,
          }),
      ),
    );
    yield* setFilePermissions(fs, filePath);
  });

const emptyCredentialFile: CredentialFile = {
  version: 1,
  registries: {},
};

const keychainAccount = (registryUrl: string): string => `registry:${registryUrl}`;

const readKeychainCredentialFile = (
  registryUrl: string,
): Effect.Effect<Option.Option<CredentialFile>, RegistryAuthFailed> =>
  Effect.gen(function* () {
    const Entry = yield* loadKeyringEntry;
    const content = yield* Effect.try({
      try: () => {
        const entry = new Entry(KEYCHAIN_SERVICE, keychainAccount(registryUrl));
        return entry.getPassword();
      },
      catch: (error) =>
        new RegistryAuthFailed({
          category: "auth",
          detail: "OS keychain could not be read",
          cause: error,
        }),
    });
    if (content === null) return Option.none<CredentialFile>();
    return yield* decodeCredentialFileFromJsonString(content).pipe(
      Effect.map((file) => Option.some(file)),
      Effect.mapError(
        (error) =>
          new RegistryAuthFailed({
            category: "auth",
            detail: "Failed to parse OS keychain credentials",
            cause: error,
          }),
      ),
    );
  });

const writeKeychainCredentialFile = (
  registryUrl: string,
  data: CredentialFile,
): Effect.Effect<void, RegistryAuthFailed> =>
  Effect.gen(function* () {
    const encoded = yield* Schema.encodeEffect(CredentialFileSchema)(data).pipe(
      Effect.mapError(
        (error) =>
          new RegistryAuthFailed({
            category: "auth",
            detail: "Failed to encode credential file",
            cause: error,
          }),
      ),
    );
    const content = JSON.stringify(encoded);
    const Entry = yield* loadKeyringEntry;
    yield* Effect.try({
      try: () => {
        const entry = new Entry(KEYCHAIN_SERVICE, keychainAccount(registryUrl));
        entry.setPassword(content);
      },
      catch: (error) =>
        new RegistryAuthFailed({
          category: "auth",
          detail: "OS keychain could not be written",
          cause: error,
        }),
    });
  });

const deleteKeychainCredentialFile = (
  registryUrl: string,
): Effect.Effect<void, RegistryAuthFailed> =>
  Effect.gen(function* () {
    const Entry = yield* loadKeyringEntry;
    yield* Effect.try({
      try: () => {
        const entry = new Entry(KEYCHAIN_SERVICE, keychainAccount(registryUrl));
        entry.deletePassword();
      },
      catch: (error) =>
        new RegistryAuthFailed({
          category: "auth",
          detail: "OS keychain credential could not be deleted",
          cause: error,
        }),
    }).pipe(Effect.catch(() => Effect.void));
  });

// -----------------------------------------------------------------------------
// Tier selection based on environment
// -----------------------------------------------------------------------------

export interface EnvironmentInfo {
  readonly isSSH: boolean;
  readonly isContainer: boolean;
  readonly isWSL: boolean;
  readonly isCI: boolean;
  readonly isRoot: boolean;
  readonly isGenericBunExecutable: boolean;
}

const isGenericBunExecutable = (): boolean => {
  const executable = process.execPath.replaceAll("\\", "/").toLowerCase();
  return executable.endsWith("/bun") || executable.endsWith("/bun.exe");
};

export const detectEnvironment = Effect.gen(function* () {
  return {
    isSSH: yield* isSSH,
    isContainer: yield* isContainer,
    isWSL: yield* isWSL,
    isCI: yield* isCI,
    isRoot: isRoot(),
    isGenericBunExecutable: isGenericBunExecutable(),
  } satisfies EnvironmentInfo;
});

/**
 * Select storage tier based on detected environment.
 *
 * Use OS keychain by default, falling back to the restricted file backend when
 * keychain access is unavailable. Whether persistence is allowed is a separate
 * policy decision.
 */
export const selectTier = (env: EnvironmentInfo): StorageTier =>
  env.isContainer || env.isCI || env.isSSH || env.isGenericBunExecutable
    ? "restricted-file"
    : "keychain";

export const canUsePersistedCredentials = (env: EnvironmentInfo): boolean => !env.isCI;

export const makePersistedCredentialsUnsupportedError = (): AuthTokenPolicyRequired =>
  new AuthTokenPolicyRequired({});

// -----------------------------------------------------------------------------
// Live layer
// -----------------------------------------------------------------------------

export const CredentialStoreLive = Layer.effect(
  CredentialStore,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const axmUserHome = yield* envOption("AXM_USER_HOME");
    const home = yield* envOption("HOME");
    const userProfile = yield* envOption("USERPROFILE");
    const homePath = yield* envOption("HOMEPATH");
    const homeDir = resolveCredentialHomeDir({ axmUserHome, home, userProfile, homePath });
    const env = yield* detectEnvironment;
    const storageTier = selectTier(env);
    const persistedCredentialsAllowed = canUsePersistedCredentials(env);
    const readStoredFile = () =>
      withCredentialFileLock(fs, path, homeDir, readCredentialFile(fs, path, homeDir));
    const writeStoredFile = (data: CredentialFile) =>
      withCredentialFileLock(fs, path, homeDir, writeCredentialFile(fs, path, homeDir, data));

    const loadCredentialFile = (registryUrl: string) =>
      storageTier === "keychain"
        ? readKeychainCredentialFile(registryUrl).pipe(
            Effect.catch(() =>
              Effect.logWarning("OS keychain unavailable; using restricted credential file.").pipe(
                Effect.flatMap(() => readStoredFile()),
              ),
            ),
          )
        : readStoredFile();

    // Returns the tier actually used, so the caller only deletes the plaintext
    // fallback file when the keychain write genuinely succeeded — never when we
    // fell back to writing that file because the keychain was unavailable.
    const saveCredentialFile = (registryUrl: string, data: CredentialFile) =>
      storageTier === "keychain"
        ? writeKeychainCredentialFile(registryUrl, data).pipe(
            Effect.as("keychain" as const),
            Effect.catch(() =>
              Effect.logWarning("OS keychain unavailable; using restricted credential file.").pipe(
                Effect.flatMap(() => writeStoredFile(data)),
                Effect.as("file" as const),
              ),
            ),
          )
        : writeStoredFile(data).pipe(Effect.as("file" as const));
    const save: CredentialStoreService["save"] = Effect.fn("CredentialStore.save")(
      function* (registryUrl, handle, credentials) {
        if (!persistedCredentialsAllowed) {
          return yield* makePersistedCredentialsUnsupportedError();
        }

        if (env.isRoot) {
          yield* Effect.logWarning("Running as root. Credentials will be owned by root.");
        }

        const existing = yield* loadCredentialFile(registryUrl);
        const file = Option.getOrElse(existing, () => emptyCredentialFile);

        const registryEntry = file.registries[registryUrl] ?? { accounts: {} };
        const updatedAccounts: Record<string, CredentialEntry> = {};
        for (const [h, entry] of Object.entries(registryEntry.accounts)) {
          if (entry !== undefined) {
            updatedAccounts[h] = { ...entry, active: false };
          }
        }
        updatedAccounts[handle] = {
          access_token: credentials.access_token,
          refresh_token: credentials.refresh_token,
          expires_at: credentials.expires_at,
          active: true,
        };

        const updated: CredentialFile = {
          ...file,
          registries: {
            ...file.registries,
            [registryUrl]: { accounts: updatedAccounts },
          },
        };

        const usedTier = yield* saveCredentialFile(registryUrl, updated);
        // Only clear the plaintext file when credentials actually landed in the
        // keychain; if we fell back to the file, deleting it would lose them.
        if (usedTier === "keychain") {
          yield* deleteCredentialFile(fs, path, homeDir);
        }
      },
    );
    const load: CredentialStoreService["load"] = Effect.fn("CredentialStore.load")(
      function* (registryUrl) {
        const existing = yield* loadCredentialFile(registryUrl);
        if (Option.isNone(existing)) return Option.none<StoredCredentials>();

        const registry = existing.value.registries[registryUrl];
        if (!registry) return Option.none<StoredCredentials>();

        for (const [handle, entry] of Object.entries(registry.accounts)) {
          if (entry?.active) {
            return Option.some<StoredCredentials>({
              handle: decodeHandleSync(handle),
              access_token: entry.access_token,
              refresh_token: entry.refresh_token,
              expires_at: entry.expires_at,
            });
          }
        }

        return Option.none<StoredCredentials>();
      },
    );
    const clear: CredentialStoreService["clear"] = Effect.fn("CredentialStore.clear")(
      function* (registryUrl) {
        if (storageTier === "keychain") {
          yield* deleteKeychainCredentialFile(registryUrl);
        }
        const existing = yield* readStoredFile();
        if (Option.isNone(existing)) return;

        const { [registryUrl]: _, ...remainingRegistries } = existing.value.registries;
        const updated: CredentialFile = {
          ...existing.value,
          registries: remainingRegistries,
        };

        yield* writeStoredFile(updated);
      },
    );

    return {
      tier: storageTier,
      allowsPersistedCredentials: persistedCredentialsAllowed,
      save,
      load,
      clear,
    } satisfies CredentialStoreService;
  }),
);

/**
 * Decorates a credential store with a per-layer, per-origin read memo.
 * Successful empty reads are memoized; failures remain retryable. Every
 * successful write invalidates only the affected origin.
 */
export const CredentialStoreSessionLive = Layer.effect(
  CredentialStore,
  Effect.gen(function* () {
    const store = yield* CredentialStore;
    const cache = yield* Ref.make(new Map<string, Option.Option<StoredCredentials>>());
    const locks = yield* Ref.make(new Map<string, Semaphore.Semaphore>());

    const getLock = (registryUrl: string) =>
      Ref.modify(locks, (current) => {
        const existing = current.get(registryUrl);
        if (existing !== undefined) return [existing, current];
        const created = Semaphore.makeUnsafe(1);
        const updated = new Map(current);
        updated.set(registryUrl, created);
        return [created, updated];
      });

    const getCached = (registryUrl: string) =>
      Effect.map(Ref.get(cache), (current) => {
        const cached = current.get(registryUrl);
        return cached === undefined
          ? Option.none<Option.Option<StoredCredentials>>()
          : Option.some(cached);
      });

    const invalidate = (registryUrl: string) =>
      Ref.update(cache, (current) => {
        const updated = new Map(current);
        updated.delete(registryUrl);
        return updated;
      });

    const load: CredentialStoreService["load"] = (registryUrl) =>
      Effect.gen(function* () {
        const cached = yield* getCached(registryUrl);
        if (Option.isSome(cached)) return cached.value;

        const lock = yield* getLock(registryUrl);
        return yield* lock.withPermits(1)(
          Effect.gen(function* () {
            const afterWait = yield* getCached(registryUrl);
            if (Option.isSome(afterWait)) return afterWait.value;
            const loaded = yield* store.load(registryUrl);
            yield* Ref.update(cache, (current) => {
              const updated = new Map(current);
              updated.set(registryUrl, loaded);
              return updated;
            });
            return loaded;
          }),
        );
      });

    return {
      tier: store.tier,
      allowsPersistedCredentials: store.allowsPersistedCredentials,
      load,
      save: (registryUrl, handle, credentials) =>
        store.save(registryUrl, handle, credentials).pipe(Effect.andThen(invalidate(registryUrl))),
      clear: (registryUrl) =>
        store.clear(registryUrl).pipe(Effect.andThen(invalidate(registryUrl))),
    } satisfies CredentialStoreService;
  }),
);

// -----------------------------------------------------------------------------
// Test layer factory
// -----------------------------------------------------------------------------

export const CredentialStoreTest = (
  tier: StorageTier = "restricted-file",
  initialData?: CredentialFile,
  allowsPersistedCredentials?: boolean,
) => {
  let data: CredentialFile = initialData ?? emptyCredentialFile;
  const persistedCredentialsAllowed = allowsPersistedCredentials ?? true;

  return Layer.succeed(CredentialStore, {
    tier,
    allowsPersistedCredentials: persistedCredentialsAllowed,

    save: (registryUrl, handle, credentials) =>
      persistedCredentialsAllowed
        ? Effect.sync(() => {
            const registryEntry = data.registries[registryUrl] ?? { accounts: {} };
            const updatedAccounts: Record<string, CredentialEntry> = {};
            for (const [h, entry] of Object.entries(registryEntry.accounts)) {
              if (entry !== undefined) {
                updatedAccounts[h] = { ...entry, active: false };
              }
            }
            updatedAccounts[handle] = {
              access_token: credentials.access_token,
              refresh_token: credentials.refresh_token,
              expires_at: credentials.expires_at,
              active: true,
            };
            data = {
              ...data,
              registries: {
                ...data.registries,
                [registryUrl]: { accounts: updatedAccounts },
              },
            };
          })
        : Effect.fail(makePersistedCredentialsUnsupportedError()),

    load: (registryUrl) =>
      Effect.sync(() => {
        const registry = data.registries[registryUrl];
        if (!registry) return Option.none<StoredCredentials>();
        for (const [handle, entry] of Object.entries(registry.accounts)) {
          if (entry?.active) {
            return Option.some<StoredCredentials>({
              handle: decodeHandleSync(handle),
              access_token: entry.access_token,
              refresh_token: entry.refresh_token,
              expires_at: entry.expires_at,
            });
          }
        }
        return Option.none<StoredCredentials>();
      }),

    clear: (registryUrl) =>
      Effect.sync(() => {
        const { [registryUrl]: _, ...rest } = data.registries;
        data = { ...data, registries: rest };
      }),
  } satisfies CredentialStoreService);
};
