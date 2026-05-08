/**
 * RegistryUrl service tag — configures which URL is the default registry.
 *
 * Extracted to its own module to avoid circular dependencies between
 * auth-client.ts and auth-middleware.ts.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";

export class RegistryUrl extends ServiceMap.Service<RegistryUrl, string>()(
  "@agentxm/client-core/unstable/auth/registry-url/RegistryUrl",
) {}
