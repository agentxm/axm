/** Loopback host recognition shared by local-development integrations. */

const loopbackHostnames: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Whether a WHATWG `URL.hostname` names this machine's loopback interface.
 * `URL.hostname` keeps IPv6 literals bracketed, so IPv6 loopback is `[::1]`.
 */
export const isLoopbackHostname = (hostname: string): boolean => loopbackHostnames.has(hostname);
