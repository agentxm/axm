/**
 * Auth feature module.
 *
 * Provides credential storage, environment detection, token resolution,
 * auth middleware, and device login orchestration for authentication.
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
  refreshStoredToken,
  resolveAmbientToken,
  resolveRequestToken,
  isEnvVarMessageEmitted,
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

// OAuth contract
export type { NormalizedTokenResponse } from "./oauth-contract.js";
export { decodeTokenResponse, setOAuthFormBody } from "./oauth-contract.js";

// Device login orchestration
export type {
  DeviceLoginInteractionService,
  DeviceLoginInteractionTestState,
} from "./device-login.js";
export {
  DeviceLoginInteraction,
  DeviceLoginInteractionTest,
  runDeviceLogin,
} from "./device-login.js";

// Login interaction (platform browser launch and clipboard)
export type {
  AuthLoginInteractionService,
  AuthLoginInteractionTestState,
} from "./login-interaction.js";
export {
  AuthLoginInteraction,
  AuthLoginInteractionLive,
  AuthLoginInteractionTest,
} from "./login-interaction.js";

// Auth guard combinator
export { withAuthGuard } from "./guard.js";
