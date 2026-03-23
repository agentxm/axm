/**
 * CredentialStore Effect service — 3-tier credential storage.
 *
 * Tier 1: OS keychain (TODO: @napi-rs/keyring not yet added)
 * Tier 2: File with restrictive permissions (~/.config/axm/credentials.json)
 * Tier 3: Plaintext file with warning
 *
 * Environment detection determines which tier is selected.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "@effect/platform/FileSystem";
import * as Path from "@effect/platform/Path";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { CliError } from "../cli-error/cli-error.js";
import { makeCliError } from "../cli-error/cli-error.js";
import { CliEnvConfig } from "../config/index.js";
import { detectCI, detectContainer, detectRoot, detectSSH, detectWSL } from "./environment.js";
import type { CredentialFile, StorageTier, StoredCredentials } from "./schema.js";
import { CredentialFileSchema } from "./schema.js";

// -----------------------------------------------------------------------------
// Service interface
// -----------------------------------------------------------------------------

export interface CredentialStoreService {
  readonly save: (
    registryUrl: string,
    handle: string,
    credentials: {
      readonly access_token: string;
      readonly refresh_token: string;
      readonly expires_at: string;
    },
  ) => Effect.Effect<void, CliError>;
  readonly load: (registryUrl: string) => Effect.Effect<Option.Option<StoredCredentials>, CliError>;
  readonly clear: (registryUrl: string) => Effect.Effect<void, CliError>;
  readonly tier: StorageTier;
}

export class CredentialStore extends Context.Tag("@axm.sh/cli/CredentialStore")<
  CredentialStore,
  CredentialStoreService
>() {}

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const CREDENTIALS_FILENAME = "credentials.json";
const CONFIG_DIR_NAME = "axm";
const DIR_PERMISSIONS = 0o700;
const FILE_PERMISSIONS = 0o600;

// -----------------------------------------------------------------------------
// Internal helpers (take fs/path as args to avoid context leakage)
// -----------------------------------------------------------------------------

const resolveHomeDir = (config: {
  readonly home: Option.Option<string>;
  readonly userProfile: Option.Option<string>;
  readonly homePath: Option.Option<string>;
}): string =>
  Option.getOrElse(
    Option.orElse(
      Option.orElse(config.home, () => config.userProfile),
      () => config.homePath,
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
    const exists = yield* fs.exists(dir).pipe(Effect.catchAll(() => Effect.succeed(false)));
    if (!exists) {
      yield* fs.makeDirectory(dir, { recursive: true }).pipe(
        Effect.mapError((error) =>
          makeCliError({
            code: "AUTH_CREDENTIAL_STORE_FAILED",
            what: `Failed to create credentials directory: ${dir}`,
            details: [String(error)],
            howToFix: `Ensure you have write access to ~/.config/`,
            cause: error,
          }),
        ),
      );
      yield* Effect.tryPromise({
        try: () => import("node:fs/promises").then((fsp) => fsp.chmod(dir, DIR_PERMISSIONS)),
        catch: () => undefined,
      }).pipe(Effect.catchAll(() => Effect.void));
    }
  });

const checkFilePermissions = (filePath: string) =>
  Effect.tryPromise({
    try: () =>
      import("node:fs/promises").then(async (fsp) => {
        const stat = await fsp.stat(filePath);

        return (stat.mode & 0o777) > FILE_PERMISSIONS;
      }),
    catch: () => false,
  }).pipe(Effect.catchAll(() => Effect.succeed(false)));

const setFilePermissions = (filePath: string) =>
  Effect.tryPromise({
    try: () => import("node:fs/promises").then((fsp) => fsp.chmod(filePath, FILE_PERMISSIONS)),
    catch: () => undefined,
  }).pipe(Effect.catchAll(() => Effect.void));

const readCredentialFile = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  homeDir: string,
): Effect.Effect<Option.Option<CredentialFile>, CliError> =>
  Effect.gen(function* () {
    const filePath = getCredentialsPath(path, homeDir);
    const exists = yield* fs.exists(filePath).pipe(Effect.catchAll(() => Effect.succeed(false)));
    if (!exists) return Option.none<CredentialFile>();

    const overly = yield* checkFilePermissions(filePath);
    if (overly) {
      yield* Effect.logWarning("Credential file has overly permissive permissions.");
    }

    const content = yield* fs.readFileString(filePath).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "AUTH_CREDENTIAL_STORE_FAILED",
          what: "Failed to read credential file",
          details: [String(error)],
          cause: error,
        }),
      ),
    );

    const json = yield* Effect.try({
      try: () => JSON.parse(content) as unknown,
      catch: (error) =>
        makeCliError({
          code: "AUTH_CREDENTIAL_STORE_FAILED",
          what: "Failed to parse credential file",
          details: [String(error)],
          howToFix:
            "The credential file may be corrupt. Delete it and re-authenticate with `axm login`.",
          cause: error,
        }),
    });

    return yield* Schema.decodeUnknown(CredentialFileSchema)(json).pipe(
      Effect.map((file) => Option.some(file)),
      Effect.catchAll(() =>
        Effect.logWarning("Credential file failed schema validation, treating as empty.").pipe(
          Effect.map(() => Option.none<CredentialFile>()),
        ),
      ),
    );
  });

const writeCredentialFile = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  homeDir: string,
  data: CredentialFile,
): Effect.Effect<void, CliError> =>
  Effect.gen(function* () {
    yield* ensureCredentialsDir(fs, path, homeDir);
    const filePath = getCredentialsPath(path, homeDir);
    const encoded = yield* Schema.encode(CredentialFileSchema)(data).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "AUTH_CREDENTIAL_STORE_FAILED",
          what: "Failed to encode credential file",
          details: [String(error)],
          cause: error,
        }),
      ),
    );
    const content = JSON.stringify(encoded, null, 2);
    yield* fs.writeFileString(filePath, content).pipe(
      Effect.mapError((error) =>
        makeCliError({
          code: "AUTH_CREDENTIAL_STORE_FAILED",
          what: "Failed to write credential file",
          details: [String(error)],
          cause: error,
        }),
      ),
    );
    yield* setFilePermissions(filePath);
  });

const emptyCredentialFile: CredentialFile = {
  version: 1,
  registries: {},
};

// -----------------------------------------------------------------------------
// Tier selection based on environment
// -----------------------------------------------------------------------------

export interface EnvironmentInfo {
  readonly isSSH: boolean;
  readonly isContainer: boolean;
  readonly isWSL: boolean;
  readonly isCI: boolean;
  readonly isRoot: boolean;
}

export const detectEnvironment = Effect.gen(function* () {
  const isSSH = yield* detectSSH;
  const isContainer = yield* detectContainer;
  const isWSL = yield* detectWSL;
  const isCI = yield* detectCI;
  const isRoot = yield* detectRoot;
  return { isSSH, isContainer, isWSL, isCI, isRoot } satisfies EnvironmentInfo;
});

/**
 * Select storage tier based on detected environment.
 *
 * - Container → tier 3 (plaintext with warning)
 * - CI → tier 3 (plaintext, but token resolution via env var is expected)
 * - SSH → tier 2 (encrypted file; keychain may not be available)
 * - WSL → try tier 1, fall back to tier 2 (keychain not implemented, so tier 2)
 * - Default → try tier 1, fall back to tier 2 (keychain not implemented, so tier 2)
 */
export const selectTier = (env: EnvironmentInfo): StorageTier => {
  if (env.isContainer) return "plaintext-file";
  if (env.isCI) return "plaintext-file";
  if (env.isSSH) return "encrypted-file";
  // WSL and default: would try keychain first, but not implemented yet
  // TODO: when @napi-rs/keyring is added, try keychain first for WSL and default
  return "encrypted-file";
};

// -----------------------------------------------------------------------------
// Warnings
// -----------------------------------------------------------------------------

const emitEnvironmentWarnings = (env: EnvironmentInfo, tier: StorageTier) =>
  Effect.gen(function* () {
    if (env.isRoot) {
      yield* Effect.logWarning("Running as root. Credentials will be owned by root.");
    }
    if (tier === "plaintext-file") {
      yield* Effect.logWarning(
        "Credentials stored in plaintext. Consider using AXM_TOKEN for CI environments.",
      );
    }
  });

// -----------------------------------------------------------------------------
// Live layer
// -----------------------------------------------------------------------------

export const CredentialStoreLive = Layer.effect(
  CredentialStore,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const config = yield* CliEnvConfig;
    const homeDir = resolveHomeDir(config);
    const env = yield* detectEnvironment;
    const storageTier = selectTier(env);
    yield* emitEnvironmentWarnings(env, storageTier);

    return {
      tier: storageTier,

      save: (registryUrl, handle, credentials) =>
        Effect.gen(function* () {
          const existing = yield* readCredentialFile(fs, path, homeDir);
          const file = Option.getOrElse(existing, () => emptyCredentialFile);

          const registryEntry = file.registries[registryUrl] ?? { accounts: {} };
          const updatedAccounts: Record<
            string,
            { access_token: string; refresh_token: string; expires_at: string; active: boolean }
          > = {};
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

          yield* writeCredentialFile(fs, path, homeDir, updated);
        }).pipe(Effect.withSpan("CredentialStore.save")),

      load: (registryUrl) =>
        Effect.gen(function* () {
          const existing = yield* readCredentialFile(fs, path, homeDir);
          if (Option.isNone(existing)) return Option.none<StoredCredentials>();

          const registry = existing.value.registries[registryUrl];
          if (!registry) return Option.none<StoredCredentials>();

          for (const [handle, entry] of Object.entries(registry.accounts)) {
            if (entry?.active) {
              return Option.some<StoredCredentials>({
                handle,
                access_token: entry.access_token,
                refresh_token: entry.refresh_token,
                expires_at: entry.expires_at,
              });
            }
          }

          return Option.none<StoredCredentials>();
        }).pipe(Effect.withSpan("CredentialStore.load")),

      clear: (registryUrl) =>
        Effect.gen(function* () {
          const existing = yield* readCredentialFile(fs, path, homeDir);
          if (Option.isNone(existing)) return;

          const { [registryUrl]: _, ...remainingRegistries } = existing.value.registries;
          const updated: CredentialFile = {
            ...existing.value,
            registries: remainingRegistries,
          };

          yield* writeCredentialFile(fs, path, homeDir, updated);
        }).pipe(Effect.withSpan("CredentialStore.clear")),
    } satisfies CredentialStoreService;
  }),
);

// -----------------------------------------------------------------------------
// Test layer factory
// -----------------------------------------------------------------------------

export const CredentialStoreTest = (
  tier: StorageTier = "encrypted-file",
  initialData?: CredentialFile,
) => {
  let data: CredentialFile = initialData ?? emptyCredentialFile;

  return Layer.succeed(CredentialStore, {
    tier,

    save: (registryUrl, handle, credentials) =>
      Effect.sync(() => {
        const registryEntry = data.registries[registryUrl] ?? { accounts: {} };
        const updatedAccounts: Record<
          string,
          { access_token: string; refresh_token: string; expires_at: string; active: boolean }
        > = {};
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
      }),

    load: (registryUrl) =>
      Effect.sync(() => {
        const registry = data.registries[registryUrl];
        if (!registry) return Option.none<StoredCredentials>();
        for (const [handle, entry] of Object.entries(registry.accounts)) {
          if (entry?.active) {
            return Option.some<StoredCredentials>({
              handle,
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
