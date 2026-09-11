/**
 * The system-keychain implementation of {@link McpSecretStore}.
 *
 * The native binding is loaded lazily: a machine without a usable keychain
 * still installs MCP servers, reporting the credential action instead of
 * failing the closure.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import {
  MCP_SECRET_SERVICE,
  McpSecretStore,
  type McpSecretEraseOutcome,
  type McpSecretStoreService,
  type McpSecretWriteOutcome,
} from "./secret-store.js";

interface KeyringEntry {
  readonly getPassword: () => string | null;
  readonly setPassword: (password: string) => void;
  readonly deletePassword: () => boolean;
}

type KeyringEntryConstructor = new (service: string, account: string) => KeyringEntry;

interface KeyringModule {
  readonly Entry: KeyringEntryConstructor;
}

const keyringModuleSpecifier = ["@napi-rs", "keyring"].join("/");

const loadKeyringEntry = Effect.tryPromise({
  try: async () => {
    const keyring: KeyringModule = await import(keyringModuleSpecifier);
    return keyring.Entry;
  },
  catch: () => undefined,
});

const service: McpSecretStoreService = {
  read: (account) =>
    Effect.gen(function* () {
      const Entry = yield* loadKeyringEntry;
      return yield* Effect.try({
        try: () => Option.fromNullOr(new Entry(MCP_SECRET_SERVICE, account).getPassword()),
        catch: () => undefined,
      }).pipe(Effect.catch(() => Effect.succeed(Option.none<string>())));
    }).pipe(Effect.catch(() => Effect.succeed(Option.none<string>()))),

  write: (account, value) =>
    Effect.gen(function* () {
      const Entry = yield* loadKeyringEntry;
      return yield* Effect.try({
        try: (): McpSecretWriteOutcome => {
          new Entry(MCP_SECRET_SERVICE, account).setPassword(value);
          return "saved";
        },
        catch: () => undefined,
      });
    }).pipe(Effect.catch(() => Effect.succeed<McpSecretWriteOutcome>("failed"))),

  erase: (account) =>
    Effect.gen(function* () {
      const Entry = yield* loadKeyringEntry;
      return yield* Effect.try({
        try: (): McpSecretEraseOutcome =>
          new Entry(MCP_SECRET_SERVICE, account).deletePassword() ? "deleted" : "absent",
        catch: () => undefined,
      });
    }).pipe(Effect.catch(() => Effect.succeed<McpSecretEraseOutcome>("failed"))),
};

/** The system keychain, behind the MCP secret-store port. */
export const McpSecretStoreLive: Layer.Layer<McpSecretStore> = Layer.succeed(
  McpSecretStore,
  service,
);
