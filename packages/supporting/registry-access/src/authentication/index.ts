/**
 * Registry authentication, identity, token authority, and verified writes.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export {
  AuthExchangeFailed,
  AuthInteractionAbandoned,
  AuthLoginRequired,
  AuthTokenPolicyRequired,
  DeviceAuthorizationPending,
  DeviceLoginCodeExpired,
  DeviceLoginDenied,
  PublishAuthorizationPending,
  REGISTRY_ACCESS_ERROR_CATEGORIES,
  RegistryAccessFailed,
  StepUpRequired,
  StepUpVerificationPending,
  authLoginRequired,
  isAuthError,
  isRegistryAccessFailure,
  type AuthError,
  type RegistryAccessErrorCategory,
  type RegistryAccessFailure,
  type StepUpRequest,
} from "./errors.js";

export type {
  AuthClientService,
  CreatePublishAuthorizationRequestParams,
  CreateTokenOptions,
  DeviceFlowResponse,
  ExchangePublishAuthorizationCodeParams,
  MeResponse,
  PollResult,
  PublishAuthorizationExchangeResponse,
  PublishAuthorizationRequestResponse,
  PublishCapabilityResponse,
} from "./auth-client.js";
export { AuthClient, pollOnce, readStepUpRequest } from "./auth-client.js";
export type { NormalizedTokenResponse } from "./oauth-contract.js";

export type {
  DeviceLoginInteractionService,
  DeviceLoginPendingResult,
  ResumeDeviceLoginOptions,
} from "./device-login.js";
export {
  DeviceLoginInteraction,
  DeviceLoginPendingDocumentSchema,
  DeviceLoginPendingResultSchema,
  initiateDeviceLogin,
  resumeDeviceLogin,
  runDeviceLogin,
  type RunDeviceLoginOptions,
} from "./device-login.js";

export {
  LoginDocumentSchema,
  LoginResultSchema,
  makeLoginResult,
  type LoginDocument,
  type LoginResult,
} from "./login-output.js";
export type {
  AuthLoginPresenterService,
  AuthLoginProgress,
  DeviceCodeFallbackReason,
  DeviceFlowPresentation,
  SessionReplacementDecision,
  StepUpChallengePresentation,
} from "./login-presenter.js";
export { AuthLoginPresenter } from "./login-presenter.js";

export {
  runWithStepUp,
  type StepUpOptions,
  type StepUpPresentation,
  type VerifiedWrite,
} from "./step-up.js";
export { selectedRegistry, type SelectedRegistry } from "./selected-registry.js";

export {
  classifyLoopbackFailure,
  deviceLoginOptions,
  login,
  resumeLoginOptions,
  type LoginOutcome,
  type LoginRequest,
} from "./login.js";
export { logout, type LogoutOutcome } from "./logout.js";
export { currentIdentity, currentToken, type RegistryIdentity } from "./identity.js";
export {
  MAX_TOKEN_LIFETIME_SECONDS,
  MIN_TOKEN_LIFETIME_SECONDS,
  createToken,
  listTokens,
  parseExpiresInSeconds,
  revokeToken,
  tokenPermissions,
  validateExpiresInSeconds,
  type CreateTokenRequest,
  type CreatedToken,
  type TokenAuthorityRequest,
} from "./tokens.js";

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
export { withAuthGuard } from "./guard.js";

export type { AuthLoginInteractionService } from "../adapters/login-interaction.js";
export { AuthLoginInteraction } from "../adapters/login-interaction.js";
export { LoopbackCallbackRejected, LoopbackLoginFallback } from "../adapters/loopback-server.js";

export type {
  PendingDeviceLogin,
  PendingDeviceLoginStoreService,
} from "./pending-device-login-store.js";
export { PendingDeviceLoginSchema, PendingDeviceLoginStore } from "./pending-device-login-store.js";
export {
  PendingPublishAuthorizationSchema,
  PendingPublishAuthorizationStore,
  type PendingPublishAuthorization,
  type PendingPublishAuthorizationStoreService,
} from "./pending-publish-authorization-store.js";
