/**
 * Schema definitions for credential storage and token sources.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import * as Schema from "effect/Schema";

// -----------------------------------------------------------------------------
// Credential Entry
// -----------------------------------------------------------------------------

export const CredentialEntrySchema = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.String,
  expires_at: Schema.String,
  active: Schema.Boolean,
});

export type CredentialEntry = typeof CredentialEntrySchema.Type;

// -----------------------------------------------------------------------------
// Registry Accounts
// -----------------------------------------------------------------------------

export const RegistryAccountsSchema = Schema.Struct({
  accounts: Schema.Record({ key: Schema.String, value: CredentialEntrySchema }),
});

export type RegistryAccounts = typeof RegistryAccountsSchema.Type;

// -----------------------------------------------------------------------------
// Credential File (versioned, keyed by registry URL)
// -----------------------------------------------------------------------------

export const CredentialFileSchema = Schema.Struct({
  version: Schema.Literal(1),
  registries: Schema.Record({ key: Schema.String, value: RegistryAccountsSchema }),
});

export type CredentialFile = typeof CredentialFileSchema.Type;

// -----------------------------------------------------------------------------
// Token Source (tagged union)
// -----------------------------------------------------------------------------

export class EnvVarTokenSource extends Data.TaggedClass("EnvVar")<{
  readonly token: string;
}> {}

export class FlagTokenSource extends Data.TaggedClass("Flag")<{
  readonly token: string;
}> {}

export class CredentialStoreTokenSource extends Data.TaggedClass("CredentialStore")<{
  readonly token: string;
  readonly refresh_token: string;
  readonly expires_at: string;
  readonly registryUrl: string;
}> {}

export type TokenSource = EnvVarTokenSource | FlagTokenSource | CredentialStoreTokenSource;

// -----------------------------------------------------------------------------
// Stored Credentials (returned from CredentialStore.load)
// -----------------------------------------------------------------------------

export interface StoredCredentials {
  readonly handle: string;
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_at: string;
}

// -----------------------------------------------------------------------------
// Storage Tier
// -----------------------------------------------------------------------------

export type StorageTier = "keychain" | "encrypted-file" | "plaintext-file";
