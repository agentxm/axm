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
  InstallMcpServerOperationArgs,
  InstallMcpServerOperation,
  UninstallMcpServerOperationArgs,
  UninstallMcpServerOperation,
} from "./operations/index.js";
export { publishMcpServer, installMcpServer, uninstallMcpServer } from "./operations/index.js";
