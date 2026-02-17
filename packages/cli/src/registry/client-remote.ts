/**
 * Remote HTTPS registry client stub.
 *
 * All operations fail with "remote registry not yet supported" error.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";

import { makeCliError } from "../cli-error/index.js";
import type { RegistryClient } from "./client.js";

// -----------------------------------------------------------------------------
// Remote Registry Client (Stub)
// -----------------------------------------------------------------------------

const remoteNotSupported = () =>
  Effect.fail(
    makeCliError({
      code: "REGISTRY_REMOTE_NOT_SUPPORTED",
      what: "remote registry not yet supported",
    }),
  );

/**
 * Creates a remote HTTPS registry client stub.
 *
 * All operations fail with "remote registry not yet supported" error.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const createRemoteRegistryClient = (): RegistryClient => ({
  getExtensionsByScope: () => remoteNotSupported(),
  scopeExists: () => remoteNotSupported(),
  getExtensionPackage: () => remoteNotSupported(),
  publishExtension: () => remoteNotSupported(),
  extensionExists: () => remoteNotSupported(),
});
