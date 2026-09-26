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
import * as Cache from "effect/Cache";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Data from "effect/Data";
import type * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as lockfile from "proper-lockfile";
import { resolveUserHome, writeFileAtomic } from "@agentxm/host-primitives";
import { decodeHandleSync, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import { AuthTokenPolicyRequired, RegistryAccessFailed } from "../authentication/errors.js";
import {
  AuthEnvironment,
  isCI,
  isContainer,
  isRoot,
  isSSH,
  isWSL,
} from "../adapters/environment.js";
import type {
  CredentialEntry,
  CredentialFile,
  RegistryAccounts,
  StorageTier,
  StoredCredentials,
} from "./schema.js";
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
  ) => Effect.Effect<void, RegistryAccessFailed | AuthTokenPolicyRequired>;
  readonly load: (
    registryUrl: string,
  ) => Effect.Effect<Option.Option<StoredCredentials>, RegistryAccessFailed>;
  /**
   * Read the stored credential from storage, past any per-session memo.
   *
   * Session refresh is the one reader that must see what another process just
   * wrote: it decides between spending its own refresh token and adopting the
   * one a concurrent process rotated, and a memoized snapshot would make every
   * waiter spend a token that is already gone.
   */
  readonly reload: (
    registryUrl: string,
  ) => Effect.Effect<Option.Option<StoredCredentials>, RegistryAccessFailed>;
  readonly clear: (registryUrl: string) => Effect.Effect<void, RegistryAccessFailed>;
  /**
   * Run an effect while holding the credential home's refresh lock.
   *
   * The lock spans the whole renewal — the re-read, the token round trip, and
   * the write — because refresh tokens rotate with reuse detection: two
   * processes that spend the same one lose the family and both end up holding
   * dead credentials. The store owns the lock because it owns the directory the
   * processes share.
   */
  readonly withRefreshLock: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | RegistryAccessFailed, R>;
  readonly tier: StorageTier;
  readonly allowsPersistedCredentials: boolean;
}

export class CredentialStore extends ServiceMap.Service<CredentialStore, CredentialStoreService>()(
  "@agentxm/registry-access/credential-store/CredentialStore",
) {}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const CREDENTIALS_FILENAME = "credentials.json";
const REFRESH_LOCK_FILENAME = "refresh.lock";
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

class KeyringUnavailable extends Data.TaggedError("KeyringUnavailable")<{
  readonly cause: unknown;
}> {}

const nativeKeyringEntry = Effect.tryPromise({
  try: async () => {
    const keyring: KeyringModule = await import(keyringModuleSpecifier);
    return keyring.Entry;
  },
  catch: (error) => new KeyringUnavailable({ cause: error }),
});

/** Native-module boundary for the owning adapter's deterministic tests. */
export const KeyringEntryLoader = ServiceMap.Reference<
  Effect.Effect<KeyringEntryConstructor, KeyringUnavailable>
>("@agentxm/registry-access/KeyringEntryLoader", { defaultValue: () => nativeKeyringEntry });

// -----------------------------------------------------------------------------
// Internal helpers (take fs/path as args to avoid context leakage)
// -----------------------------------------------------------------------------

const getCredentialsDir = (path: Path.Path, homeDir: string) => {
  return path.join(homeDir, ".config", CONFIG_DIR_NAME);
};

const getCredentialsPath = (path: Path.Path, homeDir: string) =>
  path.join(getCredentialsDir(path, homeDir), CREDENTIALS_FILENAME);

const ensureCredentialsDir = (fs: FileSystem.FileSystem, path: Path.Path, homeDir: string) =>
  Effect.gen(function* () {
    const dir = getCredentialsDir(path, homeDir);
    yield* fs.makeDirectory(dir, { recursive: true, mode: DIR_PERMISSIONS }).pipe(
      Effect.mapError(
        (error) =>
          new RegistryAccessFailed({
            category: "auth",
            detail: `Failed to create credentials directory: ${dir}`,
            suggestions: [{ description: `Ensure you have write access to ~/.config/` }],
            cause: error,
          }),
      ),
    );
    yield* fs.chmod(dir, DIR_PERMISSIONS).pipe(
      Effect.mapError(
        (cause) =>
          new RegistryAccessFailed({
            category: "auth",
            detail: "Could not restrict credential directory permissions",
            cause,
          }),
      ),
    );
  });

const checkFilePermissions = (fs: FileSystem.FileSystem, filePath: string) =>
  fs.stat(filePath).pipe(
    Effect.map((stat) => (stat.mode & 0o077) !== 0),
    Effect.mapError(
      (cause) =>
        new RegistryAccessFailed({
          category: "auth",
          detail: "Credential file permissions could not be inspected",
          cause,
        }),
    ),
  );

/**
 * Hold one `proper-lockfile` lock for the duration of `effect`.
 *
 * Acquisition and release are one resource, so nothing stays held however
 * `effect` ends. Waiting for the lock stays interruptible — a caller's deadline
 * is not extended by another process's turn — and a wait that is abandoned
 * gives the lock straight back if it arrives afterwards. A lock that is
 * compromised while held — its directory removed, or its heartbeat missed for
 * longer than `stale` because the process was suspended — interrupts `effect`
 * and fails with `failure`: whoever took the lock over may already be inside
 * the section this holder believed it owned.
 */
export const withFileLock = <A, E, R>(
  target: string,
  options: Pick<lockfile.LockOptions, "retries" | "stale" | "update">,
  failure: (cause: unknown) => RegistryAccessFailed,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | RegistryAccessFailed, R> =>
  Effect.gen(function* () {
    const compromised = yield* Deferred.make<never, RegistryAccessFailed>();
    const acquire = Effect.callback<() => Promise<void>, RegistryAccessFailed>((resume) => {
      let abandoned = false;
      lockfile
        .lock(target, {
          ...options,
          onCompromised: (cause) => {
            Deferred.doneUnsafe(compromised, Effect.fail(failure(cause)));
          },
        })
        .then(
          (release) => {
            if (abandoned) {
              release().then(undefined, () => undefined);
            } else {
              resume(Effect.succeed(release));
            }
          },
          (cause: unknown) => resume(Effect.fail(failure(cause))),
        );
      return Effect.sync(() => {
        abandoned = true;
      });
    });
    // `Effect.acquireUseRelease` with one difference: the wait for the lock is
    // restored to the caller's interruptibility. The hand-over from a granted
    // lock to its release registration is not.
    return yield* Effect.uninterruptibleMask((restore) =>
      Effect.flatMap(restore(acquire), (release) =>
        restore(Effect.raceFirst(effect, Deferred.await(compromised))).pipe(
          // Releasing a lock that was compromised rejects; there is nothing
          // left to give back, so release is complete either way.
          Effect.ensuring(Effect.ignore(Effect.tryPromise(() => release()))),
        ),
      ),
    );
  });

const withCredentialFileLock = <A, E, R>(
  fs: FileSystem.FileSystem,
  path: Path.Path,
  homeDir: string,
  effect: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    yield* ensureCredentialsDir(fs, path, homeDir);
    return yield* withFileLock(
      getCredentialsDir(path, homeDir),
      // The section spans a complete read-modify-write, so a holder is gone in
      // milliseconds. The budget covers many invocations queueing behind each
      // other, because a request that cannot read its credential fails rather
      // than going out without one.
      { retries: { retries: 40, minTimeout: 25, maxTimeout: 100 } },
      (cause) =>
        new RegistryAccessFailed({
          category: "auth",
          detail: "Could not lock credential storage",
          cause,
        }),
      effect,
    );
  });

/**
 * Hold the credential home's refresh lock for the duration of `effect`.
 *
 * `stale` is generous because the protected section includes a network round
 * trip. The retry budget outlasts the refresh grant's 30-second deadline, so a
 * waiter takes its turn after a slow holder instead of giving up on a session
 * that is still being renewed; each waiter's own turn is short because it
 * re-reads and finds the work already done.
 */
const withRefreshFileLock = <A, E, R>(
  fs: FileSystem.FileSystem,
  path: Path.Path,
  homeDir: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | RegistryAccessFailed, R> =>
  Effect.gen(function* () {
    yield* ensureCredentialsDir(fs, path, homeDir);
    const lockPath = path.join(getCredentialsDir(path, homeDir), REFRESH_LOCK_FILENAME);
    yield* fs.writeFileString(lockPath, "", { flag: "a", mode: FILE_PERMISSIONS }).pipe(
      Effect.mapError(
        (error) =>
          new RegistryAccessFailed({
            category: "auth",
            detail: "Could not create the session refresh lock",
            cause: error,
          }),
      ),
    );
    return yield* withFileLock(
      lockPath,
      {
        stale: 30_000,
        update: 5_000,
        retries: { retries: 80, minTimeout: 50, maxTimeout: 500, factor: 1.5 },
      },
      (cause) =>
        new RegistryAccessFailed({
          category: "auth",
          detail: "Could not lock the session for refresh",
          cause,
        }),
      effect,
    );
  });

const readCredentialFile = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  homeDir: string,
): Effect.Effect<Option.Option<CredentialFile>, RegistryAccessFailed> =>
  Effect.gen(function* () {
    const filePath = getCredentialsPath(path, homeDir);
    const content = yield* fs.readFileString(filePath).pipe(
      Effect.map(Option.some),
      Effect.catch((error) =>
        error.reason._tag === "NotFound"
          ? Effect.succeed(Option.none<string>())
          : Effect.fail(
              new RegistryAccessFailed({
                category: "auth",
                detail: "Credential file could not be read",
                cause: error,
              }),
            ),
      ),
    );
    if (Option.isNone(content)) return Option.none<CredentialFile>();
    const overly = yield* checkFilePermissions(fs, filePath);
    if (overly) {
      yield* Effect.logWarning("Credential file has overly permissive permissions.");
    }

    return yield* decodeCredentialFileFromJsonString(content.value).pipe(
      Effect.map((file) => Option.some(file)),
      Effect.mapError(
        () =>
          new RegistryAccessFailed({
            category: "auth",
            detail: "Failed to parse credential file",
            suggestions: [
              {
                description: "Repair or restore a valid credential file before trying again.",
              },
            ],
            // Schema errors carry the decoded input, which includes tokens.
            cause: { _tag: "CredentialFileDecodeError" },
          }),
      ),
    );
  });

const deleteCredentialFile = (fs: FileSystem.FileSystem, path: Path.Path, homeDir: string) =>
  Effect.gen(function* () {
    const filePath = getCredentialsPath(path, homeDir);
    yield* fs.remove(filePath).pipe(
      Effect.catch((cause) =>
        cause.reason._tag === "NotFound"
          ? Effect.void
          : Effect.fail(
              new RegistryAccessFailed({
                category: "auth",
                detail: "Credential file could not be removed",
                cause,
              }),
            ),
      ),
    );
  });

const writeCredentialFile = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  homeDir: string,
  data: CredentialFile,
): Effect.Effect<void, RegistryAccessFailed> =>
  Effect.gen(function* () {
    yield* ensureCredentialsDir(fs, path, homeDir);
    const filePath = getCredentialsPath(path, homeDir);
    const encoded = yield* Schema.encodeEffect(CredentialFileSchema)(data).pipe(
      Effect.mapError(
        (error) =>
          new RegistryAccessFailed({
            category: "auth",
            detail: "Failed to encode credential file",
            cause: error,
          }),
      ),
    );
    const content = JSON.stringify(encoded, null, 2);
    yield* writeFileAtomic(fs, {
      targetPath: filePath,
      content,
      mode: FILE_PERMISSIONS,
      mapError: (failure) =>
        new RegistryAccessFailed({
          category: "auth",
          detail: "Failed to write credential file",
          cause: failure.cause,
        }),
    });
  });

const emptyCredentialFile: CredentialFile = {
  version: 1,
  registries: {},
};

const keychainAccount = (registryUrl: string): string => `registry:${registryUrl}`;

const readKeychainCredentialFile = (
  registryUrl: string,
  loadKeyringEntry: Effect.Effect<KeyringEntryConstructor, KeyringUnavailable>,
): Effect.Effect<Option.Option<CredentialFile>, RegistryAccessFailed | KeyringUnavailable> =>
  Effect.gen(function* () {
    const Entry = yield* loadKeyringEntry;
    const content = yield* Effect.try({
      try: () => {
        const entry = new Entry(KEYCHAIN_SERVICE, keychainAccount(registryUrl));
        return entry.getPassword();
      },
      catch: (error) => new KeyringUnavailable({ cause: error }),
    });
    if (content === null) return Option.none<CredentialFile>();
    return yield* decodeCredentialFileFromJsonString(content).pipe(
      Effect.map((file) => Option.some(file)),
      Effect.mapError(
        () =>
          new RegistryAccessFailed({
            category: "auth",
            detail: "Failed to parse OS keychain credentials",
            cause: { _tag: "CredentialFileDecodeError" },
          }),
      ),
    );
  });

const writeKeychainCredentialFile = (
  registryUrl: string,
  data: CredentialFile,
  loadKeyringEntry: Effect.Effect<KeyringEntryConstructor, KeyringUnavailable>,
): Effect.Effect<void, RegistryAccessFailed | KeyringUnavailable> =>
  Effect.gen(function* () {
    const encoded = yield* Schema.encodeEffect(CredentialFileSchema)(data).pipe(
      Effect.mapError(
        (error) =>
          new RegistryAccessFailed({
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
      catch: (error) => new KeyringUnavailable({ cause: error }),
    });
  });

const deleteKeychainCredentialFile = (
  registryUrl: string,
  loadKeyringEntry: Effect.Effect<KeyringEntryConstructor, KeyringUnavailable>,
): Effect.Effect<void, RegistryAccessFailed> =>
  Effect.gen(function* () {
    const Entry = yield* loadKeyringEntry.pipe(
      Effect.mapError(
        ({ cause }) =>
          new RegistryAccessFailed({
            category: "auth",
            detail: "OS keychain module could not be loaded",
            cause,
          }),
      ),
    );
    yield* Effect.try({
      try: () => {
        const entry = new Entry(KEYCHAIN_SERVICE, keychainAccount(registryUrl));
        entry.deletePassword();
      },
      catch: (error) => new KeyringUnavailable({ cause: error }),
    }).pipe(Effect.catchTag("KeyringUnavailable", () => Effect.void));
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
    const keyringEntry = yield* KeyringEntryLoader;
    const homeDir = yield* resolveUserHome().pipe(
      Effect.provideServiceEffect(ConfigProvider.ConfigProvider, AuthEnvironment),
      Effect.mapError(
        (cause) =>
          new RegistryAccessFailed({
            category: "auth",
            detail: "Could not read authentication configuration: AXM_USER_HOME",
            cause,
          }),
      ),
    );
    const env = yield* detectEnvironment;
    const storageTier = selectTier(env);
    const persistedCredentialsAllowed = canUsePersistedCredentials(env);
    // Callers own one lock around the complete operation, including its read.
    const readStoredFile = () => readCredentialFile(fs, path, homeDir);
    const writeStoredFile = (data: CredentialFile) => writeCredentialFile(fs, path, homeDir, data);
    const locked = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      withCredentialFileLock(fs, path, homeDir, effect);
    const removeStoredRegistry = (registryUrl: string) =>
      Effect.gen(function* () {
        const existing = yield* readStoredFile();
        if (Option.isNone(existing) || existing.value.registries[registryUrl] === undefined) return;
        const { [registryUrl]: _, ...registries } = existing.value.registries;
        if (Object.keys(registries).length === 0) {
          yield* deleteCredentialFile(fs, path, homeDir);
        } else {
          yield* writeStoredFile({ ...existing.value, registries });
        }
      });

    // A read falls back silently. The auth middleware looks a credential up
    // for every request origin, so a read happens on commands that never
    // authenticate — `axm upgrade` reads the store on its way to GitHub. On a
    // host without a reachable keychain that made an environment fact into a
    // per-request warning on unrelated commands, and the fallback changes
    // neither the outcome nor the reader's next action. The write below is
    // where the tier matters, because there a credential lands in a file
    // instead of the keychain.
    const loadCredentialFile = (registryUrl: string, readFile = readStoredFile) =>
      storageTier === "keychain"
        ? readKeychainCredentialFile(registryUrl, keyringEntry).pipe(
            Effect.flatMap((existing) =>
              Option.isSome(existing) ? Effect.succeed(existing) : readFile(),
            ),
            Effect.catchTag("KeyringUnavailable", () =>
              Effect.logDebug(
                "OS keychain unavailable; reading the restricted credential file.",
              ).pipe(Effect.flatMap(readFile)),
            ),
          )
        : readFile();

    // Returns the tier actually used, so the caller only removes this registry's
    // plaintext entry when the keychain write genuinely succeeded.
    // A host without a reachable keychain is a standing fact about the
    // machine, not news about the command being run: every credential write
    // repeated it above the command's own title, whatever the command was. It
    // is worth stating when the fallback first changes where credentials live
    // — the restricted file did not exist before this write — and is a debug
    // fact on every write after that.
    const noteKeychainFallback = readStoredFile().pipe(
      Effect.flatMap((existing) =>
        Option.isSome(existing)
          ? Effect.logDebug("OS keychain unavailable; using restricted credential file.")
          : Effect.logWarning("OS keychain unavailable; using restricted credential file."),
      ),
    );
    const saveCredentialFile = (registryUrl: string, accounts: RegistryAccounts) => {
      const writeFallback = Effect.gen(function* () {
        const existing = yield* readStoredFile();
        const file = Option.getOrElse(existing, () => emptyCredentialFile);
        yield* writeStoredFile({
          ...file,
          registries: { ...file.registries, [registryUrl]: accounts },
        });
      });
      return storageTier === "keychain"
        ? writeKeychainCredentialFile(
            registryUrl,
            { version: 1, registries: { [registryUrl]: accounts } },
            keyringEntry,
          ).pipe(
            Effect.as("keychain" as const),
            Effect.catchTag("KeyringUnavailable", () =>
              noteKeychainFallback.pipe(Effect.andThen(writeFallback), Effect.as("file" as const)),
            ),
          )
        : writeFallback.pipe(Effect.as("file" as const));
    };
    const save: CredentialStoreService["save"] = Effect.fn("CredentialStore.save")(
      function* (registryUrl, handle, credentials) {
        if (!persistedCredentialsAllowed) {
          return yield* makePersistedCredentialsUnsupportedError();
        }

        if (env.isRoot) {
          yield* Effect.logWarning("Running as root. Credentials will be owned by root.");
        }

        // Validate the fallback before modifying either tier: an unreadable file
        // cannot authorize replacing or removing credentials we could not inspect.
        if (storageTier === "keychain") yield* readStoredFile();
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

        const usedTier = yield* saveCredentialFile(registryUrl, { accounts: updatedAccounts });
        if (usedTier === "keychain") {
          yield* removeStoredRegistry(registryUrl);
        }
      },
      (effect) => (persistedCredentialsAllowed ? locked(effect) : effect),
    );
    const load: CredentialStoreService["load"] = Effect.fn("CredentialStore.load")(
      function* (registryUrl) {
        const existing = yield* loadCredentialFile(registryUrl, () => locked(readStoredFile()));
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
    const clear: CredentialStoreService["clear"] = Effect.fn("CredentialStore.clear")(function* (
      registryUrl,
    ) {
      yield* readStoredFile();
      if (storageTier === "keychain") {
        yield* deleteKeychainCredentialFile(registryUrl, keyringEntry);
      }
      yield* removeStoredRegistry(registryUrl);
    }, locked);

    return {
      tier: storageTier,
      allowsPersistedCredentials: persistedCredentialsAllowed,
      save,
      load,
      // Nothing memoizes here, so the storage read is already the fresh one.
      reload: load,
      clear,
      withRefreshLock: (effect) => withRefreshFileLock(fs, path, homeDir, effect),
    } satisfies CredentialStoreService;
  }),
);

/**
 * Decorates a credential store with a per-layer, per-origin read memo.
 *
 * Reads go through an `Effect.Cache` keyed by registry origin, which owns the
 * concurrent-lookup sharing, per-key invalidation, and result-dependent expiry
 * that this layer previously hand-rolled with a value map, a semaphore map, and
 * a double-checked read.
 *
 * Capacity is `Number.POSITIVE_INFINITY`: the cache never evicts on size, which
 * preserves the unbounded map this layer already used. The key space is the set
 * of distinct registry origins a single process contacts — the configured
 * registry plus any origins named by workspace extension sources — so there is
 * no measured workload that justifies a numeric bound. The bound that matters
 * is lifetime, and it is the layer's: the cache is created per
 * `CredentialStoreSessionLive` construction and released with it, so a CLI
 * session is its longest possible life.
 *
 * Expiry is result-dependent. Successful reads — including a successful empty
 * read — live for the session, so repeated authentication paths pay one load
 * per origin. Failed reads expire immediately, so a failure is never memoized
 * and a later request retries against the store.
 *
 * Callers that arrive while a lookup is in flight share it rather than issuing
 * their own; callers that arrive after a failed lookup resolves start a new
 * one. That replaces the old per-origin semaphore, under which every waiter on
 * a failing origin retried serially. Sharing is safe here because each auth
 * path issues a single load and none of them depends on serial retry.
 *
 * Caller interruption invalidates the affected origin so later reads can
 * retry. Cache owns the lookup fiber's cancellation when its last waiter
 * leaves.
 *
 * Effect Cache starts a lookup before inserting its pending entry. Yielding
 * before invoking the backing store lets that insertion finish before a read
 * can synchronously resume a writer. Successful save/clear invalidation then
 * removes the pending entry; its eventual result cannot restore stale state.
 * An overlapping reader can still receive its earlier snapshot, while reads
 * started after the write completes observe the updated store.
 */
export const CredentialStoreSessionLive = Layer.effect(
  CredentialStore,
  Effect.gen(function* () {
    const store = yield* CredentialStore;
    const cache = yield* Cache.makeWith(
      (registryUrl: string) => Effect.andThen(Effect.yieldNow, () => store.load(registryUrl)),
      {
        capacity: Number.POSITIVE_INFINITY,
        timeToLive: (exit: Exit.Exit<Option.Option<StoredCredentials>, RegistryAccessFailed>) =>
          Exit.isSuccess(exit) ? Duration.infinity : Duration.zero,
      },
    );

    return {
      tier: store.tier,
      allowsPersistedCredentials: store.allowsPersistedCredentials,
      load: (registryUrl) =>
        Cache.get(cache, registryUrl).pipe(
          Effect.onInterrupt(() => Cache.invalidate(cache, registryUrl)),
        ),
      // Drop the memo first, so a caller reading past it also leaves the next
      // ordinary read observing storage rather than the snapshot it replaced.
      reload: (registryUrl) =>
        Cache.invalidate(cache, registryUrl).pipe(Effect.andThen(() => store.reload(registryUrl))),
      withRefreshLock: store.withRefreshLock,
      save: (registryUrl, handle, credentials) =>
        store
          .save(registryUrl, handle, credentials)
          .pipe(Effect.andThen(Cache.invalidate(cache, registryUrl))),
      clear: (registryUrl) =>
        store.clear(registryUrl).pipe(Effect.andThen(Cache.invalidate(cache, registryUrl))),
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
  const refreshLock = Semaphore.makeUnsafe(1);

  const read = (registryUrl: string) =>
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
    });

  return Layer.succeed(CredentialStore, {
    tier,
    allowsPersistedCredentials: persistedCredentialsAllowed,
    // One process, so the in-memory permit is the whole mutual exclusion the
    // real cross-process lock provides.
    withRefreshLock: (effect) => refreshLock.withPermits(1)(effect),

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

    load: read,

    reload: read,

    clear: (registryUrl) =>
      Effect.sync(() => {
        const { [registryUrl]: _, ...rest } = data.registries;
        data = { ...data, registries: rest };
      }),
  } satisfies CredentialStoreService);
};
