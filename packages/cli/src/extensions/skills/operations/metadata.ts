import { defineOperationMetadata } from "../../../workspace/operation-metadata.js";

export const installSkillOperationMetadata = defineOperationMetadata({
  name: "install-skill",
  lockfilePolicy: "materialize_if_missing",
});

export const uninstallSkillOperationMetadata = defineOperationMetadata({
  name: "uninstall-skill",
  lockfilePolicy: "read_recover_if_missing",
});

export const publishSkillOperationMetadata = defineOperationMetadata({
  name: "publish-skill",
  lockfilePolicy: "ignore_if_missing",
});

export const copySkillOperationMetadata = defineOperationMetadata({
  name: "copy-skill",
  lockfilePolicy: "ignore_if_missing",
});

export const enableSkillOperationMetadata = defineOperationMetadata({
  name: "enable-skill",
  lockfilePolicy: "ignore_if_missing",
});

export const disableSkillOperationMetadata = defineOperationMetadata({
  name: "disable-skill",
  lockfilePolicy: "ignore_if_missing",
});

export const renameSkillOperationMetadata = defineOperationMetadata({
  name: "rename-skill",
  lockfilePolicy: "ignore_if_missing",
});

export const newSkillOperationMetadata = defineOperationMetadata({
  name: "new-skill",
  lockfilePolicy: "ignore_if_missing",
});

export const skillOperationMetadataRegistry = {
  [installSkillOperationMetadata.name]: installSkillOperationMetadata,
  [uninstallSkillOperationMetadata.name]: uninstallSkillOperationMetadata,
  [publishSkillOperationMetadata.name]: publishSkillOperationMetadata,
  [copySkillOperationMetadata.name]: copySkillOperationMetadata,
  [enableSkillOperationMetadata.name]: enableSkillOperationMetadata,
  [disableSkillOperationMetadata.name]: disableSkillOperationMetadata,
  [renameSkillOperationMetadata.name]: renameSkillOperationMetadata,
  [newSkillOperationMetadata.name]: newSkillOperationMetadata,
} as const;
