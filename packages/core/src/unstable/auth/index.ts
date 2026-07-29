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
  canUsePersistedCredentials,
  CredentialStore,
  CredentialStoreLive,
  CredentialStoreTest,
  detectEnvironment,
  makePersistedCredentialsUnsupportedError,
  selectTier,
} from "./credential-store.js";

// Token resolution
export {
  getCurrentUserHandle,
  resolveRequiredToken,
  resolveToken,
  resolveStoredToken,
  refreshStoredToken,
  resolveAmbientToken,
  resolveRequestToken,
} from "./token-resolution.js";

// Registry URL service
export { RegistryUrl } from "./registry-url.js";

// Auth middleware
export { AuthMiddlewareLive, makeAuthMiddlewareLive } from "./auth-middleware.js";

// Auth client
export type {
  AuthClientService,
  CreatePublishAuthorizationRequestParams,
  DeviceFlowResponse,
  ExchangePublishAuthorizationCodeParams,
  MeResponse,
  PollResult,
  PublishAuthorizationRequestResponse,
  PublishCapabilityResponse,
} from "./auth-client.js";
export { AuthClient, AuthClientLive, AuthClientTest, pollOnce } from "./auth-client.js";

// OAuth contract
export type { NormalizedTokenResponse } from "./oauth-contract.js";

// Device login orchestration
export type {
  DeviceLoginInteractionService,
  DeviceLoginInteractionTestState,
} from "./device-login.js";
export {
  DeviceLoginInteraction,
  DeviceLoginInteractionTest,
  runDeviceLogin,
  type RunDeviceLoginOptions,
} from "./device-login.js";

export {
  makeOAuthState,
  makePkceChallenge,
  makePkceVerifier,
  runLoopbackLogin,
  type RunLoopbackLoginOptions,
} from "./loopback-login.js";
export {
  LoopbackCallbackRejected,
  LoopbackLoginFallback,
  startLoopbackServer,
} from "./loopback-server.js";
export {
  LoginDocumentSchema,
  LoginResultSchema,
  type LoginDocument,
  type LoginResult,
} from "./login-output.js";
export {
  runPublishAuthorization,
  type PublishAuthorizationInput,
} from "./publish-authorization.js";
export {
  selectLoginStrategy,
  type LoginStrategy,
  type LoginStrategyEnvironment,
  type LoginStrategyOptions,
} from "./login-strategy.js";

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
export type {
  AuthGuardInteractionService,
  AuthGuardInteractionTestState,
} from "./guard-interaction.js";
export {
  AuthGuardInteraction,
  AuthGuardInteractionLive,
  AuthGuardInteractionTest,
} from "./guard-interaction.js";
export { withAuthGuard } from "./guard.js";
