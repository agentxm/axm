/**
 * Deterministic in-memory Layer implementations of the registry-auth
 * services. Tests and specifications may import this module; production
 * source composes real services from `./live` at the application boundary.
 *
 * @experimental This API is unstable and may change without notice.
 */

export { AuthClientTest } from "./auth-client.js";
export { CredentialStoreTest } from "./credential-store.js";
export {
  DeviceLoginInteractionTest,
  type DeviceLoginInteractionTestState,
} from "./device-login.js";
export {
  AuthLoginInteractionTest,
  type AuthLoginInteractionTestState,
} from "./login-interaction.js";
export { AuthLoginPresenterTest, type AuthLoginPresenterTestState } from "./login-presenter.js";
export { PendingDeviceLoginStoreTest } from "./pending-device-login-store.js";
