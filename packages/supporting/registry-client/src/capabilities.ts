/**
 * What a Registry transport implements.
 *
 * An HTTP(S) Registry implements every operation the Registry protocol
 * defines. A file Registry is a directory: it serves reads, discovery,
 * publication with its preview, and visibility, and nothing that needs a
 * server — no lifecycle management and no authentication. Those two are
 * checked here before any client, credential, or file is touched, so a
 * refusal leaves everything as it was.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import {
  isHttpRegistryEndpoint,
  type HttpRegistryEndpoint,
  type RegistryEndpoint,
} from "@agentxm/extension-model/unstable/extensions/registry-endpoint";

import { RegistryOperationUnsupported } from "./errors.js";

/** An operation family only an HTTP(S) Registry implements. */
type ServerOnlyOperation = "lifecycle" | "auth";

/** The refusal of an operation the endpoint's transport does not implement. */
const unsupportedRegistryOperation = (
  endpoint: RegistryEndpoint,
  kind: ServerOnlyOperation,
  operation: string,
): RegistryOperationUnsupported =>
  new RegistryOperationUnsupported({
    category: "validation",
    operation,
    endpoint: endpoint.href,
    transport: endpoint.transport,
    detail: `${operation} is not supported for the file Registry at ${endpoint.href}.`,
    suggestions: [
      {
        description:
          kind === "auth"
            ? "A file Registry needs no sign-in; use an HTTP(S) Registry to authenticate."
            : "Manage this extension's lifecycle on an HTTP(S) Registry.",
      },
    ],
  });

/** The HTTP(S) endpoint a server-only operation needs, or its refusal. */
export const requireHttpRegistryEndpoint = (
  endpoint: RegistryEndpoint,
  kind: ServerOnlyOperation,
  operation: string,
): Effect.Effect<HttpRegistryEndpoint, RegistryOperationUnsupported> =>
  isHttpRegistryEndpoint(endpoint)
    ? Effect.succeed(endpoint)
    : Effect.fail(unsupportedRegistryOperation(endpoint, kind, operation));
