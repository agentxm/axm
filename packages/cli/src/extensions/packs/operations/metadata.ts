import { defineOperationMetadata } from "../../../workspace/operation-metadata.js";

export const installPackOperationMetadata = defineOperationMetadata({
  name: "install-pack",
  lockfilePolicy: "materialize_if_missing",
});

export const uninstallPackOperationMetadata = defineOperationMetadata({
  name: "uninstall-pack",
  lockfilePolicy: "read_recover_if_missing",
});

export const publishPackOperationMetadata = defineOperationMetadata({
  name: "publish-pack",
  lockfilePolicy: "ignore_if_missing",
});

export const unpackPackOperationMetadata = defineOperationMetadata({
  name: "unpack-pack",
  lockfilePolicy: "ignore_if_missing",
});

export const newPackOperationMetadata = defineOperationMetadata({
  name: "new-pack",
  lockfilePolicy: "ignore_if_missing",
});

export const addToPackOperationMetadata = defineOperationMetadata({
  name: "add-to-pack",
  lockfilePolicy: "read_recover_if_missing",
});

export const removeFromPackOperationMetadata = defineOperationMetadata({
  name: "remove-from-pack",
  lockfilePolicy: "read_recover_if_missing",
});

export const packOperationMetadataRegistry = {
  [installPackOperationMetadata.name]: installPackOperationMetadata,
  [uninstallPackOperationMetadata.name]: uninstallPackOperationMetadata,
  [publishPackOperationMetadata.name]: publishPackOperationMetadata,
  [unpackPackOperationMetadata.name]: unpackPackOperationMetadata,
  [newPackOperationMetadata.name]: newPackOperationMetadata,
  [addToPackOperationMetadata.name]: addToPackOperationMetadata,
  [removeFromPackOperationMetadata.name]: removeFromPackOperationMetadata,
} as const;
