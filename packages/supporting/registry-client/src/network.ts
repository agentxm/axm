/**
 * Returns true if the hostname represents a loopback address.
 * Covers localhost, IPv4 loopback (127.0.0.1), and IPv6 loopback (::1).
 */
export const isLoopbackAddress = (hostname: string): boolean =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
