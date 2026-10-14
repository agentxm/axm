/**
 * Which credentials belong to which Registry.
 *
 * A Registry credential is stored, loaded, renewed, revoked, cleared, held,
 * and matched to a pending sign-in under one key: the Registry's origin. A
 * configured source name is never a key, so two names for one Registry share
 * its credentials and a credential for one origin never reaches another
 * scheme, host, or port.
 *
 * Ambient credentials — `AXM_TOKEN`, `AXM_TOKEN_FILE`, and a GitHub Actions
 * identity — are handed to an invocation, not to a Registry. They are
 * presented only to the Registry the settings select as the default; an
 * explicit selection of any other Registry uses that Registry's own session.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Brand from "effect/Brand";
import {
  sameRegistryEndpoint,
  type HttpRegistryEndpoint,
  type RegistryEndpoint,
} from "@agentxm/extension-model/unstable/extensions/registry-endpoint";

/** The key one Registry's credentials are kept under: its origin serialization. */
export type CredentialKey = string & Brand.Brand<"CredentialKey">;

const CredentialKey = Brand.nominal<CredentialKey>();

/** The one mapping from a Registry to the key its credentials are kept under. */
export const credentialKey = (endpoint: HttpRegistryEndpoint): CredentialKey =>
  CredentialKey(endpoint.href);

/**
 * Whether ambient credentials may be presented to `operation`: only when it is
 * the settings-selected default Registry. Any other Registry is offered its
 * own stored session or nothing.
 */
export const ambientEligible = (
  operation: HttpRegistryEndpoint,
  defaultEndpoint: RegistryEndpoint,
): boolean => sameRegistryEndpoint(operation, defaultEndpoint);
