/**
 * Registry-auth feature: login, logout, token, identity inspection, device
 * and loopback flows, and credential lifecycle.
 *
 * Provides credential storage, environment detection, token resolution,
 * auth middleware, and device login orchestration for authentication.
 * Environment-backed Layers live behind `./live`; deterministic in-memory
 * ports live behind `./testing`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

// Typed failures
export {
  AuthExchangeFailed,
  AuthLoginRequired,
  AuthTokenPolicyRequired,
  authLoginRequired,
  DeviceAuthorizationPending,
  DeviceLoginCodeExpired,
  DeviceLoginDenied,
  isAuthError,
  isRegistryAuthFailure,
  REGISTRY_AUTH_ERROR_CATEGORIES,
  RegistryAuthFailed,
  StepUpRequired,
  type AuthError,
  type RegistryAuthErrorCategory,
  type RegistryAuthFailure,
  type StepUpRequest,
} from "./errors.js";

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
  FileTokenSource,
  FlagTokenSource,
  RegistryAccountsSchema,
} from "./schema.js";

// Credential store service
export type { CredentialStoreService, EnvironmentInfo } from "./credential-store.js";
export {
  canUsePersistedCredentials,
  CredentialStore,
  detectEnvironment,
  makePersistedCredentialsUnsupportedError,
  selectTier,
} from "./credential-store.js";

export type {
  PendingDeviceLogin,
  PendingDeviceLoginStoreService,
} from "./pending-device-login-store.js";
export { PendingDeviceLoginSchema, PendingDeviceLoginStore } from "./pending-device-login-store.js";

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

// Auth client
export type {
  AuthClientService,
  CreateTokenOptions,
  CreatePublishAuthorizationRequestParams,
  DeviceFlowResponse,
  ExchangePublishAuthorizationCodeParams,
  MeResponse,
  PollResult,
  PublishAuthorizationRequestResponse,
  PublishCapabilityResponse,
} from "./auth-client.js";
export { AuthClient, pollOnce, readStepUpRequest } from "./auth-client.js";

// OAuth contract
export type { NormalizedTokenResponse } from "./oauth-contract.js";

// Device login orchestration
export type {
  DeviceLoginPendingResult,
  DeviceLoginInteractionService,
  ResumeDeviceLoginOptions,
} from "./device-login.js";
export {
  DeviceLoginPendingDocumentSchema,
  DeviceLoginPendingResultSchema,
  DeviceLoginInteraction,
  initiateDeviceLogin,
  resumeDeviceLogin,
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
  makeLoginResult,
  type LoginDocument,
  type LoginResult,
} from "./login-output.js";

// Login presentation seam (the application provides the renderer-backed Live)
export type {
  AuthLoginPresenterService,
  AuthLoginProgress,
  DeviceFlowPresentation,
} from "./login-presenter.js";
export { AuthLoginPresenter } from "./login-presenter.js";
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
export type { AuthLoginInteractionService } from "./login-interaction.js";
export { AuthLoginInteraction } from "./login-interaction.js";

// Auth guard combinator
export { withAuthGuard } from "./guard.js";
