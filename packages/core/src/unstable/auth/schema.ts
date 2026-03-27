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

export type CredentialEntry = Schema.Schema.Type<typeof CredentialEntrySchema>;

// -----------------------------------------------------------------------------
// Registry Accounts
// -----------------------------------------------------------------------------

export const RegistryAccountsSchema = Schema.Struct({
  accounts: Schema.Record(Schema.String, CredentialEntrySchema),
});

export type RegistryAccounts = Schema.Schema.Type<typeof RegistryAccountsSchema>;

// -----------------------------------------------------------------------------
// Credential File (versioned, keyed by registry URL)
// -----------------------------------------------------------------------------

export const CredentialFileSchema = Schema.Struct({
  version: Schema.Literal(1),
  registries: Schema.Record(Schema.String, RegistryAccountsSchema),
});

export type CredentialFile = Schema.Schema.Type<typeof CredentialFileSchema>;

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

export type StorageTier = "keychain" | "restricted-file" | "plaintext-file";
