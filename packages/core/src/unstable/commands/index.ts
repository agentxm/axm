export {
  COMMAND_MANIFEST_FILENAME,
  CommandManifestSchema,
  type CommandManifest,
} from "./manifest-schema.js";

export type {
  GitHostedCommandRef,
  RegistryCommandRef,
  LocalCommandRef,
  BuiltinCommandRef,
  CommandExtensionRef,
} from "./refs.js";

export { CommandManager, CommandManagerLive } from "./manager.js";

export { commandReconciliationAdapter } from "./reconciliation-adapter.js";

export { buildRegistryCommandRef } from "./registry-ref-builder.js";

export type {
  PublishCommandOperationArgs,
  PublishCommandOperation,
  InstallCommandOperationArgs,
  InstallCommandOperation,
  UninstallCommandOperationArgs,
  UninstallCommandOperation,
} from "./operations/index.js";
export { publishCommand, installCommand, uninstallCommand } from "./operations/index.js";
