/**
 * Deterministic in-memory Layer implementations of the registry-access
 * services. Tests and specifications may import this module; production
 * source composes real services from `./live` at the application boundary.
 *
 * @experimental This API is unstable and may change without notice.
 */

export { AuthClientTest } from "./authentication/auth-client.js";
export { CredentialStoreTest } from "./credentials/credential-store.js";
export {
  DeviceLoginInteractionTest,
  type DeviceLoginInteractionTestState,
} from "./authentication/device-login.js";
export {
  AuthLoginInteractionTest,
  type AuthLoginInteractionTestState,
} from "./adapters/login-interaction.js";
export {
  AuthLoginPresenterTest,
  type AuthLoginPresenterTestState,
} from "./authentication/login-presenter.js";
export { PendingDeviceLoginStoreTest } from "./authentication/pending-device-login-store.js";
