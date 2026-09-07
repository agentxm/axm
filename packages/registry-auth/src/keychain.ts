/**
 * Keychain port — the operating-system credential store behind an
 * interruptible boundary.
 *
 * The native binding also exposes a synchronous `Entry`. Its calls cannot be
 * interrupted, so a locked keychain or an access prompt blocks the process
 * with no recovery, which is why credential storage previously avoided the
 * keychain for whole classes of runs. `AsyncEntry` accepts an AbortSignal, so
 * every call here is bounded: an unresponsive keychain surfaces as a typed
 * failure the caller can fall back from instead of hanging the CLI.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { RegistryAuthFailed } from "./errors.js";

/** How long a single keychain call may take before it is treated as unavailable. */
export const KEYCHAIN_CALL_TIMEOUT = "5 seconds";

export interface KeychainService {
  /** Reads an account's secret; `Option.none()` when the account has no entry. */
  readonly get: (account: string) => Effect.Effect<Option.Option<string>, RegistryAuthFailed>;
  readonly set: (account: string, secret: string) => Effect.Effect<void, RegistryAuthFailed>;
  /** Removes an account's entry. Succeeds when the account has no entry. */
  readonly delete: (account: string) => Effect.Effect<void, RegistryAuthFailed>;
}

export class Keychain extends ServiceMap.Service<Keychain, KeychainService>()(
  "@agentxm/registry-auth/keychain/Keychain",
) {}

type AsyncKeyringEntry = {
  readonly getPassword: (signal?: AbortSignal) => Promise<string | undefined | null>;
  readonly setPassword: (password: string, signal?: AbortSignal) => Promise<void>;
  readonly deleteCredential: (signal?: AbortSignal) => Promise<boolean>;
};

type AsyncKeyringEntryConstructor = new (service: string, account: string) => AsyncKeyringEntry;

type KeyringModule = {
  readonly AsyncEntry: AsyncKeyringEntryConstructor;
};

const keyringModuleSpecifier = ["@napi-rs", "keyring"].join("/");

const unavailable = (detail: string, cause?: unknown) =>
  new RegistryAuthFailed({ category: "auth", detail, cause });

const loadAsyncEntry = Effect.tryPromise({
  try: async () => {
    const keyring: KeyringModule = await import(keyringModuleSpecifier);
    return keyring.AsyncEntry;
  },
  catch: (error) => unavailable("OS keychain module could not be loaded", error),
});

const call = <A>(
  service: string,
  account: string,
  detail: string,
  operation: (entry: AsyncKeyringEntry, signal: AbortSignal) => Promise<A>,
): Effect.Effect<A, RegistryAuthFailed> =>
  Effect.gen(function* () {
    const AsyncEntry = yield* loadAsyncEntry;
    return yield* Effect.tryPromise({
      try: (signal) => operation(new AsyncEntry(service, account), signal),
      catch: (error) => unavailable(detail, error),
    });
  }).pipe(
    // The AbortSignal reaches the native call, so the timeout releases the
    // fiber and the keychain work with it rather than leaking either.
    Effect.timeoutOrElse({
      duration: KEYCHAIN_CALL_TIMEOUT,
      orElse: () => Effect.fail(unavailable(`${detail} within ${KEYCHAIN_CALL_TIMEOUT}`)),
    }),
  );

export const makeKeychain = (service: string): KeychainService => ({
  get: (account) =>
    call(service, account, "OS keychain could not be read", (entry, signal) =>
      entry.getPassword(signal),
    ).pipe(Effect.map(Option.fromNullishOr)),
  set: (account, secret) =>
    call(service, account, "OS keychain could not be written", (entry, signal) =>
      entry.setPassword(secret, signal),
    ),
  delete: (account) =>
    call(service, account, "OS keychain credential could not be deleted", (entry, signal) =>
      entry.deleteCredential(signal),
    ).pipe(Effect.asVoid),
});

export const makeKeychainLive = (service: string) => Layer.succeed(Keychain, makeKeychain(service));

/** The keychain service name AXM stores its own credentials under. */
export const KEYCHAIN_SERVICE = "axm";

export const KeychainLive = makeKeychainLive(KEYCHAIN_SERVICE);

export interface KeychainTestState {
  /** Accounts read, written, or deleted, in call order. */
  readonly calls: Array<`${"get" | "set" | "delete"}:${string}`>;
  readonly entries: Map<string, string>;
}

/**
 * In-memory keychain. `behavior` selects how the store answers: `available`
 * serves the entries, `unavailable` fails every call the way an absent or
 * locked keychain does, and `unresponsive` never settles so callers exercise
 * the timeout.
 */
export const KeychainTest = (options?: {
  readonly entries?: Readonly<Record<string, string>>;
  readonly behavior?: "available" | "unavailable" | "unresponsive";
}) => {
  const state: KeychainTestState = {
    calls: [],
    entries: new Map(Object.entries(options?.entries ?? {})),
  };
  const behavior = options?.behavior ?? "available";

  const guard = <A>(
    operation: `${"get" | "set" | "delete"}:${string}`,
    result: Effect.Effect<A, RegistryAuthFailed>,
  ): Effect.Effect<A, RegistryAuthFailed> =>
    Effect.suspend(() => {
      state.calls.push(operation);
      if (behavior === "unavailable") return Effect.fail(unavailable("OS keychain unavailable"));
      if (behavior === "unresponsive") return Effect.never;
      return result;
    });

  const layer = Layer.succeed(Keychain, {
    get: (account) =>
      guard(
        `get:${account}`,
        Effect.sync(() => Option.fromUndefinedOr(state.entries.get(account))),
      ),
    set: (account, secret) =>
      guard(
        `set:${account}`,
        Effect.sync(() => {
          state.entries.set(account, secret);
        }),
      ),
    delete: (account) =>
      guard(
        `delete:${account}`,
        Effect.sync(() => {
          state.entries.delete(account);
        }),
      ),
  } satisfies KeychainService);

  return { layer, state } as const;
};
