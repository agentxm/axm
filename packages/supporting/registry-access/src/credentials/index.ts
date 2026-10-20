/**
 * Registry credential ownership, storage policy, and token resolution.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export type { CredentialStoreService } from "./credential-store.js";
export { CredentialStore } from "./credential-store.js";

export {
  ambientCredentialSource,
  getCurrentUserHandle,
  resolveRequestToken,
  type AmbientCredentialSource,
} from "./token-resolution.js";
export { credentialKey } from "./credential-key.js";
export { hasCredentialsForAll } from "./login-suggestion.js";

// Dependents' inferred layer and use-case types require these services, so
// their declaration emit must be able to name them; knip skips exports tagged
// public.
/** @public */
export { SessionRefresher } from "./session-refresh.js";
/** @public */
export { WorkloadCredentials } from "./workload-credentials.js";
