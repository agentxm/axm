/**
 * Auth feature module.
 *
 * Provides credential storage, environment detection, and token source types
 * for CLI authentication.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Schema types and schemas
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
  FlagTokenSource,
  RegistryAccountsSchema,
} from "./schema.js";

// Credential store service
export type { CredentialStoreService, EnvironmentInfo } from "./credential-store.js";
export {
  CredentialStore,
  CredentialStoreLive,
  CredentialStoreTest,
  detectEnvironment,
  selectTier,
} from "./credential-store.js";

// Token resolution
export {
  resolveToken,
  resolveStoredToken,
  resolveStoredTokenWithRefresh,
  refreshStoredToken,
  resolveAmbientToken,
  resetEnvVarMessageFlag,
} from "./token-resolution.js";

// Auth middleware
export { AuthMiddlewareLive, makeAuthMiddlewareLive, RegistryUrl } from "./auth-middleware.js";

// Auth client
export type {
  AuthClientService,
  DeviceFlowResponse,
  MeResponse,
  PollResult,
  TokenResponse,
} from "./auth-client.js";
export { AuthClient, AuthClientLive, AuthClientTest, pollOnce } from "./auth-client.js";

// Auth login interaction
export type {
  AuthLoginInteractionService,
  AuthLoginInteractionTestState,
} from "./login-interaction.js";
export {
  AuthLoginInteraction,
  AuthLoginInteractionLive,
  AuthLoginInteractionTest,
} from "./login-interaction.js";

// Shared device login flow
export { runDeviceLogin } from "./device-login.js";

// Auth guard
export { withAuthGuard } from "./guard.js";
