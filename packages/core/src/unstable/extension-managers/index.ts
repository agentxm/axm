/**
 * Extension manager module — per-type lifecycle managers for extensions.
 *
 * Provides managers for skills, packs, commands, and MCP servers,
 * as well as registry ref builders and pack expansion helpers.
 *
 * @experimental All exports from this module are unstable and may change without notice.
 * @packageDocumentation
 */

// Skills
export { SkillManager, SkillManagerLive } from "./skills/manager.js";
export { computeSkillPaths, type SkillPathSource, type SkillDirPaths } from "./skills/paths.js";
export {
  sanitizeName,
  getSkillDisplayName,
  getSkillFqn,
  isReferencedByPack,
  getReferencingPacks,
} from "./skills/utils.js";
export {
  skillReconciliationAdapter,
  assertSkillAdapterLoaded,
} from "./skills/reconciliation-adapter.js";

// Skills operations
export type {
  InstallSkillOperationArgs,
  InstallSkillOperation,
} from "./skills/operations/install.js";
export { installSkill } from "./skills/operations/install.js";
export type {
  UninstallSkillOperationArgs,
  UninstallSkillOperation,
} from "./skills/operations/uninstall.js";
export { uninstallSkill } from "./skills/operations/uninstall.js";
export type {
  PublishSkillOperationArgs,
  PublishSkillOperation,
} from "./skills/operations/publish.js";
export { publishSkill } from "./skills/operations/publish.js";
export type { CopySkillOperationArgs, CopySkillOperation } from "./skills/operations/copy.js";
export { copySkill } from "./skills/operations/copy.js";
export type { EnableSkillOperation } from "./skills/operations/enable.js";
export { enableSkill } from "./skills/operations/enable.js";
export type { DisableSkillOperation } from "./skills/operations/disable.js";
export { disableSkill } from "./skills/operations/disable.js";
export type { RenameSkillOperation } from "./skills/operations/rename.js";
export { renameSkill } from "./skills/operations/rename.js";
export type { NewSkillOperationArgs, NewSkillOperation } from "./skills/operations/new-skill.js";
export { newSkill } from "./skills/operations/new-skill.js";
export { copySkillDirectory } from "./skills/operations/copy-directory.js";
export type { InstallResult } from "./skills/operations/install-result.js";

// Packs
export { PackManager, PackManagerLive } from "./packs/manager.js";
export { computePackPaths, type PackDirPath } from "./packs/paths.js";
export {
  expandPackInstallRefs,
  expandPackUninstallTargets,
  resolveSkillUninstallTargetsFromLockfile,
  type UninstallSettingsContext,
} from "./packs/expansion.js";
export { packReconciliationAdapter } from "./packs/reconciliation-adapter.js";

// Packs operations
export type { InstallPackOperationArgs, InstallPackOperation } from "./packs/operations/install.js";
export { installPack } from "./packs/operations/install.js";
export type {
  UninstallPackOperationArgs,
  UninstallPackOperation,
} from "./packs/operations/uninstall.js";
export { uninstallPack } from "./packs/operations/uninstall.js";
export type { NewPackOperationArgs, NewPackOperation } from "./packs/operations/new-pack.js";
export { newPack } from "./packs/operations/new-pack.js";
export type { AddToPackOperationArgs, AddToPackOperation } from "./packs/operations/add-to-pack.js";
export { addToPack } from "./packs/operations/add-to-pack.js";
export type {
  RemoveFromPackOperationArgs,
  RemoveFromPackOperation,
} from "./packs/operations/remove-from-pack.js";
export { removeFromPack } from "./packs/operations/remove-from-pack.js";
export type { PublishPackOperationArgs, PublishPackOperation } from "./packs/operations/publish.js";
export { publishPack } from "./packs/operations/publish.js";
export type { UnpackPackOperationArgs, UnpackPackOperation } from "./packs/operations/unpack.js";
export { unpackPack } from "./packs/operations/unpack.js";

// Commands
export { CommandManager, CommandManagerLive } from "./commands/manager.js";
export { commandReconciliationAdapter } from "./commands/reconciliation-adapter.js";

// Commands operations
export type {
  InstallCommandOperationArgs,
  InstallCommandOperation,
} from "./commands/operations/install.js";
export { installCommand } from "./commands/operations/install.js";
export type {
  UninstallCommandOperationArgs,
  UninstallCommandOperation,
} from "./commands/operations/uninstall.js";
export { uninstallCommand } from "./commands/operations/uninstall.js";
export type {
  PublishCommandOperationArgs,
  PublishCommandOperation,
} from "./commands/operations/publish.js";
export { publishCommand } from "./commands/operations/publish.js";

// MCP Servers
export { McpServerManager, McpServerManagerLive } from "./mcp-servers/manager.js";
export { mcpServerReconciliationAdapter } from "./mcp-servers/reconciliation-adapter.js";

// MCP Servers operations
export type {
  InstallMcpServerOperationArgs,
  InstallMcpServerOperation,
} from "./mcp-servers/operations/install.js";
export { installMcpServer } from "./mcp-servers/operations/install.js";
export type {
  UninstallMcpServerOperationArgs,
  UninstallMcpServerOperation,
} from "./mcp-servers/operations/uninstall.js";
export { uninstallMcpServer } from "./mcp-servers/operations/uninstall.js";
export type {
  PublishMcpServerOperationArgs,
  PublishMcpServerOperation,
} from "./mcp-servers/operations/publish.js";
export { publishMcpServer } from "./mcp-servers/operations/publish.js";

// Registry ref builders
export {
  buildRegistrySkillRef,
  buildRegistryCommandRef,
  buildRegistryMcpServerRef,
} from "./registry-ref-builders.js";
