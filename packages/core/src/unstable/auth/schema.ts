/**
 * Schema definitions for credential storage and token sources.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import type * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";
import { DateTimeUtcSchema } from "../date-time.js";
import { HandleSchema, type Handle } from "../extensions/handle.js";

// -----------------------------------------------------------------------------
// Credential Entry
// -----------------------------------------------------------------------------

export const CredentialEntrySchema = Schema.Struct({
  access_token: Schema.String.pipe(
    Schema.annotateKey({ messageMissingKey: "access_token is required" }),
  ),
  refresh_token: Schema.String.pipe(
    Schema.annotateKey({ messageMissingKey: "refresh_token is required" }),
  ),
  expires_at: DateTimeUtcSchema.pipe(
    Schema.annotateKey({ messageMissingKey: "expires_at is required" }),
  ),
  active: Schema.Boolean.pipe(Schema.annotateKey({ messageMissingKey: "active is required" })),
}).annotate({
  identifier: "CredentialEntry",
  title: "Credential Entry",
  description: "A saved login credential with access token, refresh token, and expiration time.",
});

export type CredentialEntry = Schema.Schema.Type<typeof CredentialEntrySchema>;

// -----------------------------------------------------------------------------
// Registry Accounts
// -----------------------------------------------------------------------------

export const RegistryAccountsSchema = Schema.Struct({
  accounts: Schema.Record(HandleSchema, CredentialEntrySchema).pipe(
    Schema.annotateKey({ messageMissingKey: "accounts is required" }),
  ),
}).annotate({
  identifier: "RegistryAccounts",
  title: "Registry Accounts",
  description: "Accounts you're logged into on a registry, keyed by handle.",
});

export type RegistryAccounts = Schema.Schema.Type<typeof RegistryAccountsSchema>;

// -----------------------------------------------------------------------------
// Credential File (versioned, keyed by registry URL)
// -----------------------------------------------------------------------------

export const CredentialFileSchema = Schema.Struct({
  version: Schema.Literal(1).pipe(Schema.annotateKey({ messageMissingKey: "version is required" })),
  registries: Schema.Record(Schema.String, RegistryAccountsSchema).pipe(
    Schema.annotateKey({ messageMissingKey: "registries is required" }),
  ),
}).annotate({
  identifier: "CredentialFile",
  title: "Credential File",
  description: "Your saved credentials, organized by registry URL.",
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

export class FileTokenSource extends Data.TaggedClass("File")<{
  readonly token: string;
  readonly path: string;
}> {}

export class CredentialStoreTokenSource extends Data.TaggedClass("CredentialStore")<{
  readonly token: string;
  readonly refresh_token: string;
  readonly expires_at: DateTime.Utc;
  readonly registryUrl: string;
}> {}

export type TokenSource =
  EnvVarTokenSource | FileTokenSource | FlagTokenSource | CredentialStoreTokenSource;

// -----------------------------------------------------------------------------
// Stored Credentials (returned from CredentialStore.load)
// -----------------------------------------------------------------------------

export interface StoredCredentials {
  readonly handle: Handle;
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_at: DateTime.Utc;
}

// -----------------------------------------------------------------------------
// Storage Tier
// -----------------------------------------------------------------------------

export type StorageTier = "keychain" | "restricted-file" | "plaintext-file";
