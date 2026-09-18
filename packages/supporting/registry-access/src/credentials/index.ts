/**
 * Registry credential ownership, storage policy, and token resolution.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export type {
  CredentialEntry,
  CredentialFile,
  StorageTier,
  StoredCredentials,
  TokenSource,
} from "./schema.js";
export {
  CredentialEntrySchema,
  CredentialFileSchema,
  CredentialStoreTokenSource,
  EnvVarTokenSource,
  FileTokenSource,
  RegistryAccountsSchema,
} from "./schema.js";

export type { CredentialStoreService, EnvironmentInfo } from "./credential-store.js";
export {
  canUsePersistedCredentials,
  CredentialStore,
  detectEnvironment,
  makePersistedCredentialsUnsupportedError,
  selectTier,
} from "./credential-store.js";

export {
  getCurrentUserHandle,
  resolveAmbientToken,
  resolveRequestToken,
  resolveRequiredToken,
  resolveStoredToken,
  resolveToken,
} from "./token-resolution.js";
export { hasCredentialsForAll } from "./login-suggestion.js";

export { SessionRefresher } from "./session-refresh.js";
