import { isLoopbackHostname } from "@agentxm/host-primitives";
import type { HttpRegistryEndpoint } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";

/** The web surface paired with the selected Registry. */
export const webOriginForRegistry = (endpoint: HttpRegistryEndpoint): string => {
  const url = new URL(endpoint.href);
  if (url.origin === "https://registry.agentxm.ai") {
    return "https://agentxm.ai";
  }
  if (url.origin === "https://registry-dev.agentxm.ai") {
    return "https://web-dev.agentxm.ai";
  }
  const registryPort = Number(url.port);
  if (
    isLoopbackHostname(url.hostname) &&
    Number.isInteger(registryPort) &&
    registryPort >= 4300 &&
    registryPort <= 4399
  ) {
    return `${url.protocol}//${url.hostname}:${String(registryPort - 100)}`;
  }
  return url.origin;
};
