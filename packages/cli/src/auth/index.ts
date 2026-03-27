/**
 * Auth feature module (CLI layer).
 *
 * Re-exports core auth types and provides CLI-specific auth functionality:
 * login interaction (TUI) and auth guard (command decorator).
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Re-export everything from core auth
export {
  // Schema types and schemas
  type CredentialEntry,
  type CredentialFile,
  type StorageTier,
  type StoredCredentials,
  type TokenSource,
  CredentialEntrySchema,
  CredentialFileSchema,
  CredentialStoreTokenSource,
  EnvVarTokenSource,
  FlagTokenSource,
  RegistryAccountsSchema,
  // Credential store service
  type CredentialStoreService,
  type EnvironmentInfo,
  CredentialStore,
  CredentialStoreLive,
  CredentialStoreTest,
  detectEnvironment,
  selectTier,
  // Token resolution
  resolveToken,
  resolveStoredToken,
  resolveStoredTokenWithRefresh,
  refreshStoredToken,
  resolveAmbientToken,
  resolveRequestToken,
  resetEnvVarMessageFlag,
  // Auth middleware
  AuthMiddlewareLive,
  makeAuthMiddlewareLive,
  RegistryUrl,
  // Auth client
  type AuthClientService,
  type DeviceFlowResponse,
  type MeResponse,
  type PollResult,
  type TokenResponse,
  AuthClient,
  AuthClientLive,
  AuthClientTest,
  pollOnce,
  // OAuth contract
  type NormalizedTokenResponse,
  decodeTokenResponse,
  setOAuthFormBody,
  // Device login
  type DeviceLoginInteractionService,
  type DeviceLoginInteractionTestState,
  DeviceLoginInteraction,
  DeviceLoginInteractionTest,
  runDeviceLogin,
} from "@axm.sh/core/unstable/auth";

// Auth login interaction (CLI-specific)
export type {
  AuthLoginInteractionService,
  AuthLoginInteractionTestState,
} from "./login-interaction.js";
export {
  AuthLoginInteraction,
  AuthLoginInteractionLive,
  AuthLoginInteractionTest,
} from "./login-interaction.js";

// Auth guard (CLI-specific)
export { withAuthGuard } from "./guard.js";
