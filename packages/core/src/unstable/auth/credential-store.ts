/**
 * CredentialStore Effect service — credential storage and auth policy.
 *
 * Tier 1: OS keychain (TODO: @napi-rs/keyring not yet added)
 * Tier 2: Restricted-permission file (~/.config/axm/credentials.json)
 *
 * CI and container environments are token-only by policy. They do not persist
 * credentials and should use AXM_TOKEN instead.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { errAuthTokenRequired, type AppError, makeAppError } from "../app-error/index.js";
import { isCI } from "../cli-flags/index.js";
import { decodeHandleSync, type Handle } from "../extensions/handle.js";
import { envOption, isContainer, isRoot, isSSH, isWSL } from "../utils/index.js";
import type { CredentialFile, StorageTier, StoredCredentials } from "./schema.js";
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
      readonly expires_at: string;
    },
  ) => Effect.Effect<void, AppError>;
  readonly load: (registryUrl: string) => Effect.Effect<Option.Option<StoredCredentials>, AppError>;
  readonly clear: (registryUrl: string) => Effect.Effect<void, AppError>;
  readonly tier: StorageTier;
  readonly allowsPersistedCredentials: boolean;
}

export class CredentialStore extends ServiceMap.Service<CredentialStore, CredentialStoreService>()(
  "@agentxm/client-core/CredentialStore",
) {}

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
    const exists = yield* fs.exists(dir).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) {
      yield* fs.makeDirectory(dir, { recursive: true }).pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "auth",
            message: `Failed to create credentials directory: ${dir}`,
            breadcrumbs: [
              { task: "Recover", description: `Ensure you have write access to ~/.config/` },
            ],
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

const readCredentialFile = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  homeDir: string,
): Effect.Effect<Option.Option<CredentialFile>, AppError> =>
  Effect.gen(function* () {
    const filePath = getCredentialsPath(path, homeDir);
    const exists = yield* fs.exists(filePath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) return Option.none<CredentialFile>();

    const overly = yield* checkFilePermissions(fs, filePath);
    if (overly) {
      yield* Effect.logWarning("Credential file has overly permissive permissions.");
    }

    const content = yield* fs.readFileString(filePath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "auth",
          message: "Credential file could not be read",
          cause: error,
        }),
      ),
    );

    return yield* decodeCredentialFileFromJsonString(content).pipe(
      Effect.map((file) => Option.some(file)),
      Effect.mapError((error) =>
        makeAppError({
          code: "auth",
          message: "Failed to parse credential file",
          breadcrumbs: [
            {
              task: "Recover",
              description:
                "The credential file may be corrupt. Delete it and re-authenticate with `axm login`.",
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

const writeCredentialFile = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  homeDir: string,
  data: CredentialFile,
): Effect.Effect<void, AppError> =>
  Effect.gen(function* () {
    yield* ensureCredentialsDir(fs, path, homeDir);
    const filePath = getCredentialsPath(path, homeDir);
    const encoded = yield* Schema.encodeEffect(CredentialFileSchema)(data).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "auth",
          message: "Failed to encode credential file",
          cause: error,
        }),
      ),
    );
    const content = JSON.stringify(encoded, null, 2);
    yield* fs.writeFileString(filePath, content).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "auth",
          message: "Failed to write credential file",
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
  return {
    isSSH: yield* isSSH,
    isContainer: yield* isContainer,
    isWSL: yield* isWSL,
    isCI: yield* isCI,
    isRoot: isRoot(),
  } satisfies EnvironmentInfo;
});

/**
 * Select storage tier based on detected environment.
 *
 * Until keychain support lands, all persisted credentials use the restricted
 * file backend. Whether persistence is allowed is a separate policy decision.
 */
export const selectTier = (_env: EnvironmentInfo): StorageTier => "restricted-file";

export const canUsePersistedCredentials = (env: EnvironmentInfo): boolean =>
  !env.isContainer && !env.isCI;

export const makePersistedCredentialsUnsupportedError = () => errAuthTokenRequired();

// -----------------------------------------------------------------------------
// Live layer
// -----------------------------------------------------------------------------

export const CredentialStoreLive = Layer.effect(
  CredentialStore,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const home = yield* envOption("HOME");
    const userProfile = yield* envOption("USERPROFILE");
    const homePath = yield* envOption("HOMEPATH");
    const homeDir = resolveHomeDir({ home, userProfile, homePath });
    const env = yield* detectEnvironment;
    const storageTier = selectTier(env);
    const persistedCredentialsAllowed = canUsePersistedCredentials(env);
    const save: CredentialStoreService["save"] = Effect.fn("CredentialStore.save")(
      function* (registryUrl, handle, credentials) {
        if (!persistedCredentialsAllowed) {
          return yield* makePersistedCredentialsUnsupportedError();
        }

        if (env.isRoot) {
          yield* Effect.logWarning("Running as root. Credentials will be owned by root.");
        }

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
      },
    );
    const load: CredentialStoreService["load"] = Effect.fn("CredentialStore.load")(
      function* (registryUrl) {
        const existing = yield* readCredentialFile(fs, path, homeDir);
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
        const existing = yield* readCredentialFile(fs, path, homeDir);
        if (Option.isNone(existing)) return;

        const { [registryUrl]: _, ...remainingRegistries } = existing.value.registries;
        const updated: CredentialFile = {
          ...existing.value,
          registries: remainingRegistries,
        };

        yield* writeCredentialFile(fs, path, homeDir, updated);
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
