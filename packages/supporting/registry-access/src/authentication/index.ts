/**
 * Registry authentication, identity, and token authority.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

export {
  AuthExchangeFailed,
  AuthInteractionAbandoned,
  AuthTokenPolicyRequired,
  DeviceAuthorizationPending,
  DeviceLoginCodeExpired,
  DeviceLoginDenied,
  REGISTRY_ACCESS_ERROR_CATEGORIES,
  RegistryAccessFailed,
  SignedOut,
  trustedPublisherSettingsUrl,
  WorkloadTokenUnavailable,
  isRegistryAccessFailure,
  signedOut,
  type AuthError,
  type RegistryAccessFailure,
} from "./errors.js";

export type { MeResponse } from "./auth-client.js";
export { AuthClient } from "./auth-client.js";
export { webOriginForRegistry } from "./web-origin.js";
export type { DeviceLoginPendingResult } from "./device-login.js";
export { DeviceLoginInteraction, DeviceLoginPendingDocumentSchema } from "./device-login.js";

export { LoginDocumentSchema } from "./login-output.js";
export type {
  AuthLoginPresenterService,
  AuthLoginProgress,
  HumanHandoff,
  SessionReplacementDecision,
} from "./login-presenter.js";
export { AuthLoginPresenter, handoffUrl } from "./login-presenter.js";

export { selectedRegistry, type SelectedRegistry } from "./selected-registry.js";

export { classifyLoopbackFailure, deviceLoginOptions, login, type LoginOutcome } from "./login.js";
export { logout } from "./logout.js";
export { currentIdentity, currentToken, isSignedIn } from "./identity.js";
export {
  createToken,
  listTokens,
  parseExpiresInSeconds,
  revokeToken,
  type CreateTokenRequest,
  type CreatedToken,
} from "./tokens.js";

export {
  TOKEN_PERMISSION_LEVELS,
  TokenPermissionsSchema,
  describeTokenPermissions,
  readTokenPermissions,
  type TokenPermissionLevel,
} from "./tokens/permissions.js";

export { LoopbackCallbackRejected, LoopbackLoginFallback } from "../adapters/loopback-server.js";

export { PendingDeviceLoginStore } from "./pending-device-login-store.js";

// Dependents' inferred handler and test-layer types require these services,
// so their declaration emit must be able to name them; knip skips exports
// tagged public.
/** @public */
export { AuthLoginInteraction } from "../adapters/login-interaction.js";
/** @public */
export { TokenExchange } from "./auth-client.js";
