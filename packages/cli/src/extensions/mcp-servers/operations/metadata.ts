import { defineOperationMetadata } from "../../../workspace/operation-metadata.js";

export const installMcpServerOperationMetadata = defineOperationMetadata({
  name: "install-mcp-server",
  lockfilePolicy: "materialize_if_missing",
});

export const uninstallMcpServerOperationMetadata = defineOperationMetadata({
  name: "uninstall-mcp-server",
  lockfilePolicy: "read_recover_if_missing",
});

export const publishMcpServerOperationMetadata = defineOperationMetadata({
  name: "publish-mcp-server",
  lockfilePolicy: "ignore_if_missing",
});

export const mcpServerOperationMetadataRegistry = {
  [installMcpServerOperationMetadata.name]: installMcpServerOperationMetadata,
  [uninstallMcpServerOperationMetadata.name]: uninstallMcpServerOperationMetadata,
  [publishMcpServerOperationMetadata.name]: publishMcpServerOperationMetadata,
} as const;
