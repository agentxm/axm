export {
  COMMAND_MANIFEST_FILENAME,
  CommandManifestSchema,
  type CommandManifest,
} from "./manifest-schema.js";

export { CommandArgumentSchema, type CommandArgument } from "./command-argument.js";

export {
  CommandFrontmatterSchema,
  ManifestFieldsFromFrontmatterSchema,
  parseCommandMd,
  projectFrontmatterToManifest,
  type CommandFrontmatter,
  type CommandContentResult,
  type ManifestFieldsFromFrontmatter,
} from "./command-content.js";

export type {
  GitHostedCommandRef,
  RegistryCommandRef,
  LocalCommandRef,
  CommandExtensionRef,
} from "./refs.js";

export { CommandManager, CommandManagerLive, buildLockEntryFromRef } from "./manager.js";
export { commandInstallArtifact, commandUninstallArtifact } from "./install-artifact.js";

export { commandReconciliationAdapter } from "./reconciliation-adapter.js";

export { buildRegistryCommandRef } from "./registry-ref-builder.js";

export {
  commandContentFilename,
  commandContentPath,
  computeCommandPaths,
  type CommandDirPaths,
  type CommandPathSource,
} from "./paths.js";

export type { PublishCommandOperationArgs, PublishCommandOperation } from "./operations/publish.js";
export { publishCommand } from "./operations/publish.js";
export type { InstallCommandOperationArgs, InstallCommandOperation } from "./operations/install.js";
export { installCommand } from "./operations/install.js";
export type {
  UninstallCommandOperationArgs,
  UninstallCommandOperation,
} from "./operations/uninstall.js";
export { uninstallCommand } from "./operations/uninstall.js";
export type { EnableCommandOperation } from "./operations/enable.js";
export { enableCommand } from "./operations/enable.js";
export type { DisableCommandOperation } from "./operations/disable.js";
export { disableCommand } from "./operations/disable.js";
export type { NewCommandOperationArgs, NewCommandOperation } from "./operations/new-command.js";
export { newCommand } from "./operations/new-command.js";

// Rendering warnings
export {
  createWarningCollector,
  type LossyRenderingWarning,
  type WarningCollector,
} from "./rendering-warnings.js";

// Variable substitution
export {
  substituteVariables,
  resolveAgentFamily,
  agentFamilyMap,
  type PortableVariable,
  type AllArgumentsVariable,
  type PositionalVariable,
  type NamedVariable,
  type AgentFamily,
  type SubstitutionResult,
} from "./variable-substitution.js";

// Renderers
export {
  renderMarkdownWithFrontmatter,
  renderMarkdownOnly,
  renderPromptMd,
  renderToml,
  renderPlainText,
  selectRenderer,
} from "./renderers/index.js";

export type {
  AgentOverrides,
  CommandRenderOutcome,
  CommandRendered,
  CommandSkipped,
  RenderInput,
  RenderOutput,
  Renderer,
} from "./renderers/index.js";
