/**
 * Environment-backed Layers for the registry-auth feature. Only application
 * composition imports this module; feature logic keeps service requirements
 * in its Effect environment.
 *
 * @experimental This API is unstable and may change without notice.
 */

export { AuthClientLive } from "./auth-client.js";
export { AuthMiddlewareLive, makeAuthMiddlewareLive } from "./auth-middleware.js";
export { CredentialStoreLive, CredentialStoreSessionLive } from "./credential-store.js";
export { AuthLoginInteractionLive } from "./login-interaction.js";
export { PendingDeviceLoginStoreLive } from "./pending-device-login-store.js";
