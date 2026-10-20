/**
 * Deterministic in-memory Layer implementations of the registry-access
 * services. Tests and specifications may import this module; production
 * source composes real services from `./live` at the application boundary.
 *
 * @experimental This API is unstable and may change without notice.
 */

export { AuthClientTest, TokenExchangeTest } from "./authentication/auth-client.js";
export { CredentialStoreTest } from "./credentials/credential-store.js";
export { WorkloadCredentialsTest } from "./credentials/workload-credentials.js";
// Each test layer's recorded state appears in dependents' inferred test-context
// types, so their declaration emit must be able to name it; knip skips exports
// tagged public.
export {
  DeviceLoginInteractionTest,
  /** @public */
  type DeviceLoginInteractionTestState,
} from "./authentication/device-login.js";
export {
  AuthLoginInteractionTest,
  /** @public */
  type AuthLoginInteractionTestState,
} from "./adapters/login-interaction.js";
export {
  AuthLoginPresenterTest,
  /** @public */
  type AuthLoginPresenterTestState,
} from "./authentication/login-presenter.js";
export { PendingDeviceLoginStoreTest } from "./authentication/pending-device-login-store.js";
