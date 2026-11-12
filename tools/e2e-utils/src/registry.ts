export {
  startHttpRegistry,
  type HttpRegistry,
  type HttpRegistryOptions,
  // Dependent fixtures name these records in emitted declarations.
  /** @public */
  type PublishRecord,
  /** @public */
  type RequestRecord,
} from "./http-registry-server.js";
export {
  startDeviceAuthServer,
  // Dependent fixture return types name this in their declarations.
  /** @public */
  type DeviceOutcome,
} from "./device-auth-server.js";
export { fixtureArchive } from "./archive.js";
