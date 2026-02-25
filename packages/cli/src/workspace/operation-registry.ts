import * as Option from "effect/Option";
import { commandOperationMetadataRegistry } from "../extensions/commands/operations/metadata.js";
import { mcpServerOperationMetadataRegistry } from "../extensions/mcp-servers/operations/metadata.js";
import { packOperationMetadataRegistry } from "../extensions/packs/operations/metadata.js";
import { skillOperationMetadataRegistry } from "../extensions/skills/operations/metadata.js";
import { defineOperationMetadata, type OperationMetadata } from "./operation-metadata.js";

export const readRecoverLockfileOperationMetadata = defineOperationMetadata({
  name: "read-recover-lockfile",
  lockfilePolicy: "ignore_if_missing",
});

export const reconcileMaterializeLockfileOperationMetadata = defineOperationMetadata({
  name: "reconcile-materialize-lockfile",
  lockfilePolicy: "ignore_if_missing",
});

const reconciliationOperationMetadataRegistry = {
  [readRecoverLockfileOperationMetadata.name]: readRecoverLockfileOperationMetadata,
  [reconcileMaterializeLockfileOperationMetadata.name]:
    reconcileMaterializeLockfileOperationMetadata,
} as const;

export const operationMetadataRegistry = {
  ...reconciliationOperationMetadataRegistry,
  ...skillOperationMetadataRegistry,
  ...commandOperationMetadataRegistry,
  ...mcpServerOperationMetadataRegistry,
  ...packOperationMetadataRegistry,
} as const;

export type RegisteredOperationName = keyof typeof operationMetadataRegistry;

export const getOperationMetadata = (name: string): Option.Option<OperationMetadata> =>
  Option.fromNullable(operationMetadataRegistry[name as RegisteredOperationName]);

export const hasOperationMetadata = (name: string): name is RegisteredOperationName =>
  name in operationMetadataRegistry;
