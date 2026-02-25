import { defineOperationMetadata } from "../../../workspace/operation-metadata.js";

export const installCommandOperationMetadata = defineOperationMetadata({
  name: "install-command",
  lockfilePolicy: "materialize_if_missing",
});

export const uninstallCommandOperationMetadata = defineOperationMetadata({
  name: "uninstall-command",
  lockfilePolicy: "read_recover_if_missing",
});

export const publishCommandOperationMetadata = defineOperationMetadata({
  name: "publish-command",
  lockfilePolicy: "ignore_if_missing",
});

export const commandOperationMetadataRegistry = {
  [installCommandOperationMetadata.name]: installCommandOperationMetadata,
  [uninstallCommandOperationMetadata.name]: uninstallCommandOperationMetadata,
  [publishCommandOperationMetadata.name]: publishCommandOperationMetadata,
} as const;
