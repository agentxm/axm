/**
 * RegistryUrl service tag — configures which URL is the default registry.
 *
 * Lives with the Registry transport so authentication depends on the
 * Registry client and never the reverse.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";

export class RegistryUrl extends ServiceMap.Service<RegistryUrl, string>()(
  "@agentxm/extension-management/unstable/registry/registry-url/RegistryUrl",
) {}
