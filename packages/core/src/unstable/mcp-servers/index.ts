export {
  MCP_SERVER_MANIFEST_FILENAME,
  McpServerManifestSchema,
  type McpServerManifest,
} from "./manifest-schema.js";

export type {
  GitHostedMcpServerRef,
  RegistryMcpServerRef,
  LocalMcpServerRef,
  BuiltinMcpServerRef,
  McpServerExtensionRef,
} from "./refs.js";

export { McpServerManager, McpServerManagerLive } from "./manager.js";

export { mcpServerReconciliationAdapter } from "./reconciliation-adapter.js";

export { buildRegistryMcpServerRef } from "./registry-ref-builder.js";

export type {
  PublishMcpServerOperationArgs,
  PublishMcpServerOperation,
} from "./operations/publish.js";
export { publishMcpServer } from "./operations/publish.js";
export type {
  InstallMcpServerOperationArgs,
  InstallMcpServerOperation,
} from "./operations/install.js";
export { installMcpServer } from "./operations/install.js";
export type {
  UninstallMcpServerOperationArgs,
  UninstallMcpServerOperation,
} from "./operations/uninstall.js";
export { uninstallMcpServer } from "./operations/uninstall.js";
