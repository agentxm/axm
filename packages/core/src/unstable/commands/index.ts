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

export type { PublishCommandOperationArgs, PublishCommandOperation } from "./operations/publish.js";
export { publishCommand } from "./operations/publish.js";
export type { InstallCommandOperationArgs, InstallCommandOperation } from "./operations/install.js";
export { installCommand } from "./operations/install.js";
export type {
  UninstallCommandOperationArgs,
  UninstallCommandOperation,
} from "./operations/uninstall.js";
export { uninstallCommand } from "./operations/uninstall.js";
