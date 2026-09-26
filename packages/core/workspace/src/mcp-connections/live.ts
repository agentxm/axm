/**
 * Environment-backed layers of the MCP connections extension kind: its manager
 * behind the kernel's manager tag, and the system keychain behind the kernel's
 * MCP credential port. Only composition roots import this module.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

export { McpServerManagerLive } from "./manager.js";
export { McpSecretStoreLive } from "./secret-store-live.js";
