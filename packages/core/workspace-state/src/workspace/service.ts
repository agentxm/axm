/**
 * TRANSITIONAL: the `WorkspaceMutations` facade composed over the narrow
 * workspace-state services. Every member delegates to `WorkspaceLocation`,
 * `SettingsReader`, `LockfileReader`, `DesiredStateReader`,
 * `WorkspaceRecords`, `ExtensionPaths`, `SettingsWriter`,
 * `AcceptedResolutionWriter`, or `DesiredStateWriter`; the facade adds no
 * behavior of its own. It exists so callers keep compiling while feature
 * slices migrate to the services, and is removed when the last handler
 * migrates. Its transaction members are gone: callers run
 * `runWorkspaceTransaction` from `@agentxm/workspace-transactions`.
 *
 * The facade keeps its members `R = never` by binding the platform of the
 * context it is built in — the one capture this transitional layer allows.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";

import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { AcceptedResolutionWriter } from "./accepted-resolution-writer.js";
import { DesiredStateReader } from "./desired-state-reader.js";
import type { SettingsEntryByType } from "./entry-accessors.js";
import { ExtensionPaths } from "./extension-paths-service.js";
import { LockfileReader } from "./lockfile-reader.js";
import { WorkspaceLocation } from "./location.js";
import type { WorkspaceMutationsService } from "./service-interface.js";
import { SettingsReader } from "./settings-reader.js";
import { SettingsWriter } from "./settings-writer.js";
import { DesiredStateWriter } from "./desired-state-writer.js";
import { WorkspaceRecords } from "./workspace-records.js";

/**
 * Compose the transitional facade from the narrow services in context.
 * Only the live composition calls this.
 */
export const makeWorkspaceMutationsFacade: Effect.Effect<
  WorkspaceMutationsService,
  never,
  | WorkspaceLocation
  | SettingsReader
  | LockfileReader
  | DesiredStateReader
  | WorkspaceRecords
  | ExtensionPaths
  | SettingsWriter
  | AcceptedResolutionWriter
  | DesiredStateWriter
  | FileSystem.FileSystem
  | Path.Path
> = Effect.gen(function* () {
  const location = yield* WorkspaceLocation;
  const settings = yield* SettingsReader;
  const lockfile = yield* LockfileReader;
  const desiredState = yield* DesiredStateReader;
  const records = yield* WorkspaceRecords;
  const paths = yield* ExtensionPaths;
  const settingsWriter = yield* SettingsWriter;
  const accepted = yield* AcceptedResolutionWriter;
  const desiredStateWriter = yield* DesiredStateWriter;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const bind = <A, E>(
    effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
  ): Effect.Effect<A, E> =>
    effect.pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );
  const entries = <T extends InstallableExtensionType>(type: T) => bind(settings.entries(type));
  const locked = <T extends InstallableExtensionType>(type: T) => bind(lockfile.entries(type));
  const lockedEntry = <T extends InstallableExtensionType>(type: T, name: string) =>
    bind(lockfile.entry(type, name));
  const setEntry = <T extends InstallableExtensionType>(
    type: T,
    name: string,
    entry: SettingsEntryByType[T],
  ) => bind(settingsWriter.setEntry(type, name, entry));
  /** Types whose missing entry is a no-op today keep that behavior through the facade. */
  const updateIgnoringMissing = <T extends "rule" | "hook" | "knowledge" | "subagent">(
    type: T,
    name: string,
    update: (entry: SettingsEntryByType[T]) => SettingsEntryByType[T],
  ) =>
    bind(settingsWriter.updateEntry(type, name, update)).pipe(
      Effect.catchTag("SettingsEntryMissing", () => Effect.void),
    );

  return {
    scope: location.scope,
    path: location.runtimeDir,
    baseDir: location.baseDir,
    get layout() {
      return Ref.getUnsafe(location.layout);
    },

    getLockfileState: () => bind(lockfile.state),
    getDesiredStateGraph: (options) => bind(desiredState.graph(options)),
    getConfiguredSources: () => bind(settings.configuredSources),
    getConfiguredSourceByName: (name) => bind(settings.sourceByName(name)),
    getRegistrySourceHosts: () => bind(settings.registrySourceHosts),
    records: {
      getInventory: (options) => bind(records.getInventory(options)),
      getExtensionInventory: (type, options) => bind(records.getExtensionInventory(type, options)),
      rows: (type) => bind(records.rows(type)),
    },
    getConfiguredOwner: () => bind(settings.owner),
    setOwner: (owner) => bind(settingsWriter.setOwner(owner)).pipe(Effect.asVoid),
    getPublishDefaultVisibility: () => bind(settings.publishDefaultVisibility),
    getMinimumReleaseAge: () => bind(settings.minimumReleaseAge),
    getMinimumReleaseAgeExclude: () => bind(settings.minimumReleaseAgeExclude),
    addConfiguredSource: (source) => bind(settingsWriter.addConfiguredSource(source)),
    getConfiguredSkillEntries: () => entries("skill"),
    getConfiguredAgents: () => bind(settings.configuredAgents),
    getInstructionsConfig: () => bind(settings.instructionsConfig),
    setInstructionsConfig: (config) => bind(settingsWriter.setInstructionsConfig(config)),
    getConfiguredMcpServerEntries: () => entries("mcp-server"),
    getConfiguredRuleEntries: () => entries("rule"),
    getLockedRules: () => locked("rule"),
    getLockedRuleEntry: (name) => lockedEntry("rule", name),
    setRule: (args) => bind(desiredStateWriter.declare("rule", args)),
    setRuleLock: ({ name, lockEntry }) => bind(accepted.setAccepted("rule", name, lockEntry)),
    removeRule: (name) => bind(desiredStateWriter.undeclare("rule", name)),
    removeRuleSettings: (name) => bind(settingsWriter.removeEntry("rule", name)),
    removeRuleLock: (name) => bind(accepted.removeAccepted("rule", name)),
    updateRuleEntry: (name, update) => updateIgnoringMissing("rule", name, update),
    setRuleEntry: (name, entry) => setEntry("rule", name, entry),
    getConfiguredHookEntries: () => entries("hook"),
    getLockedHooks: () => locked("hook"),
    getLockedHookEntry: (name) => lockedEntry("hook", name),
    setHook: (args) => bind(desiredStateWriter.declare("hook", args)),
    setHookLock: ({ name, lockEntry }) => bind(accepted.setAccepted("hook", name, lockEntry)),
    removeHook: (name) => bind(desiredStateWriter.undeclare("hook", name)),
    removeHookSettings: (name) => bind(settingsWriter.removeEntry("hook", name)),
    removeHookLock: (name) => bind(accepted.removeAccepted("hook", name)),
    updateHookEntry: (name, update) => updateIgnoringMissing("hook", name, update),
    setHookEntry: (name, entry) => setEntry("hook", name, entry),
    getKnowledgeDiscoveryConfig: () => bind(settings.knowledgeDiscoveryConfig),
    getConfiguredKnowledgeEntries: () => entries("knowledge"),
    getLockedKnowledge: () => locked("knowledge"),
    getLockedKnowledgeEntry: (name) => lockedEntry("knowledge", name),
    setKnowledge: (args) => bind(desiredStateWriter.declare("knowledge", args)),
    setKnowledgeLock: ({ name, lockEntry }) =>
      bind(accepted.setAccepted("knowledge", name, lockEntry)),
    removeKnowledge: (name) => bind(desiredStateWriter.undeclare("knowledge", name)),
    removeKnowledgeSettings: (name) => bind(settingsWriter.removeEntry("knowledge", name)),
    removeKnowledgeLock: (name) => bind(accepted.removeAccepted("knowledge", name)),
    updateKnowledgeEntry: (name, update) => updateIgnoringMissing("knowledge", name, update),
    setKnowledgeEntry: (name, entry) => setEntry("knowledge", name, entry),
    getLockedSkills: () => locked("skill"),
    getLockedSkill: (name) => lockedEntry("skill", name),
    getSkillDir: (name, source) => bind(paths.skillDir(name, source)),
    setSkill: (args) => bind(desiredStateWriter.declare("skill", args)),
    setSkillLock: ({ name, lockEntry }) => bind(accepted.setAccepted("skill", name, lockEntry)),
    removeSkill: (name) => bind(desiredStateWriter.undeclare("skill", name)),
    removeSkillFromSettings: (name) => bind(settingsWriter.removeEntry("skill", name)),
    updateSkillEntry: (name, update) => bind(settingsWriter.updateEntry("skill", name, update)),
    setSkillEntry: (name, entry) => setEntry("skill", name, entry),
    addConfiguredAgent: (agentId) => bind(settingsWriter.addConfiguredAgent(agentId)),
    removeConfiguredAgent: (agentId) => bind(settingsWriter.removeConfiguredAgent(agentId)),
    getConfiguredPackEntries: () => entries("pack"),
    getLockedPacks: () => locked("pack"),
    getLockedPack: (name) => lockedEntry("pack", name),
    setPack: (args) => bind(desiredStateWriter.declare("pack", args)),
    setPackLock: (args) => {
      const { versionRange, ...lockEntry } = args;
      void versionRange;
      return bind(accepted.setAccepted("pack", lockEntry.name, lockEntry));
    },
    setPackEntry: (name, entry) => setEntry("pack", name, entry),
    removePack: (name) => bind(desiredStateWriter.undeclare("pack", name)),
    getPackDir: (name, owner, sourceName) =>
      paths.packDir(name, owner, sourceName).pipe(Effect.provideService(Path.Path, path)),
    getLockedSubagents: () => locked("subagent"),
    getLockedSubagent: (name) => lockedEntry("subagent", name),
    getConfiguredSubagentEntries: () => entries("subagent"),
    setSubagent: (args) => bind(desiredStateWriter.declare("subagent", args)),
    setSubagentLock: ({ name, lockEntry }) =>
      bind(accepted.setAccepted("subagent", name, lockEntry)),
    removeSubagent: (name) => bind(desiredStateWriter.undeclare("subagent", name)),
    updateSubagentEntry: (name, update) => updateIgnoringMissing("subagent", name, update),
    setSubagentEntry: (name, entry) => setEntry("subagent", name, entry),
    removeSubagentSettings: (name) => bind(settingsWriter.removeEntry("subagent", name)),
    removeSubagentLock: (name) => bind(accepted.removeAccepted("subagent", name)),
    getLockedMcpServers: () => locked("mcp-server"),
    getLockedMcpServer: (resolutionKey) => lockedEntry("mcp-server", resolutionKey),
    getLockedMcpServerForConnection: (localName) =>
      bind(lockfile.mcpServerForConnection(localName)),
    setMcpServer: (args) => bind(desiredStateWriter.declare("mcp-server", args)),
    setMcpServerLock: ({ resolutionKey, lockEntry }) =>
      bind(accepted.setAccepted("mcp-server", resolutionKey, lockEntry)),
    updateMcpServerEntry: (name, update) =>
      bind(settingsWriter.updateEntry("mcp-server", name, update)),
    setMcpServerEntry: (name, entry) => setEntry("mcp-server", name, entry),
    removeMcpServer: (name) => bind(desiredStateWriter.undeclare("mcp-server", name)),
    removeSkillLock: (name) => bind(accepted.removeAccepted("skill", name)),
    removeMcpServerSettings: (name) => bind(settingsWriter.removeEntry("mcp-server", name)),
    removeMcpServerLock: (name) => bind(accepted.removeAccepted("mcp-server", name)),
    removePackSettings: (name) => bind(settingsWriter.removeEntry("pack", name)),
    removePackLock: (name) => bind(accepted.removeAccepted("pack", name)),
    isExtensionRequiredByInstalledPack: (target) =>
      bind(desiredState.isRequiredByInstalledPack(target)),
  };
});
