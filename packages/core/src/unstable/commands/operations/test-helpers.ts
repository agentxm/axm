/**
 * Shared test helpers for command operation tests (install, uninstall, enable, disable).
 *
 * @internal Test-only.
 */

import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "../../app-error/index.js";
import type { CodingAgent } from "../../agents/coding-agent.js";
import type { CodingAgentRepositoryService } from "../../agents/index.js";
import type { AgentId } from "../../agents/types.js";
import type { WorkspaceContextService } from "../../workspace/service-interface.js";
import { decodeHandleSync } from "../../extensions/handle.js";
import { taxonomyStubs } from "../../workspace/test-stubs.js";

// -----------------------------------------------------------------------------
// makeStubAgent
// -----------------------------------------------------------------------------

/** Stub CodingAgent with configurable addCommand/removeCommand behavior. */
export const makeStubAgent = (id: AgentId): CodingAgent => ({
  id,
  resolveEffectiveSkillsDir: () => Effect.succeed({ _tag: "unsupported", reason: "stub" }),
  addMcpServer: () => Effect.succeed({ _tag: "unsupported", reason: "stub" }),
  removeMcpServer: () => Effect.succeed({ _tag: "unsupported", reason: "stub" }),
  resolveEffectiveCommandsDir: ({ workspaceRoot }) =>
    Effect.succeed({
      _tag: "supported",
      dir: path.join(workspaceRoot, `.${id}`, "commands"),
      warnings: [],
    }),
  addCommand: ({ workspaceRoot, commandName }) =>
    Effect.succeed({
      _tag: "success",
      renderedFilePath: path.join(workspaceRoot, `.${id}`, "commands", `${commandName}.md`),
      warnings: [],
    }),
  removeCommand: () => Effect.succeed({ _tag: "success", renderedFilePath: "", warnings: [] }),
  resolveEffectiveSubagentsDir: () => Effect.succeed({ _tag: "unsupported", reason: "stub" }),
  addSubagent: () => Effect.succeed({ _tag: "unsupported", reason: "stub" }),
  removeSubagent: () => Effect.succeed({ _tag: "unsupported", reason: "stub" }),
});

// -----------------------------------------------------------------------------
// makeAgentRepoMock
// -----------------------------------------------------------------------------

export const makeAgentRepoMock = (
  agents: ReadonlyArray<CodingAgent> = [makeStubAgent("claude-code")],
): CodingAgentRepositoryService => ({
  get: (id) => {
    const found = agents.find((a) => a.id === id);
    if (found) return Effect.succeed(found);
    return Effect.fail(makeAppError({ code: "AGENT_NOT_FOUND", what: `Agent ${id} not found` }));
  },
  all: Effect.succeed(agents),
  getConfiguredAgents: () => Effect.succeed(agents),
  getUnknownConfiguredAgentIds: () => Effect.succeed([]),
});

// -----------------------------------------------------------------------------
// makeWorkspaceMock
// -----------------------------------------------------------------------------

/**
 * Creates a WorkspaceContextService mock with no-op defaults.
 * All methods return sensible defaults; pass `overrides` to customize
 * specific methods for a given test.
 */
export const makeWorkspaceMock = (
  axmDir: string,
  overrides?: Partial<WorkspaceContextService>,
): WorkspaceContextService => ({
  ...taxonomyStubs,
  scope: "project",
  path: axmDir,
  baseDir: path.dirname(axmDir),
  getConfiguredSources: () => Effect.succeed([]),
  getConfiguredSourceByName: () => Effect.succeed(Option.none()),
  getRegistrySourceHosts: () => Effect.succeed([]),
  getConfiguredProfile: () => Effect.succeed(decodeHandleSync("@community")),
  getDefaultProfile: () => Effect.succeed(Option.none()),
  addConfiguredSource: () => Effect.void,
  getConfiguredSkills: () => Effect.succeed({}),
  getInstalledSkills: () => Effect.succeed({}),
  getConfiguredAgents: () => Effect.succeed(["claude-code"]),
  getLockedSkills: () => Effect.succeed({}),
  getLockedSkill: () => Effect.succeed(Option.none()),
  getSkillDir: () => Effect.succeed({ canonicalPath: "", skillSrcPath: "" }),
  setSkill: () => Effect.void,
  setSkillLock: () => Effect.void,
  removeSkill: () => Effect.void,
  removeSkillFromSettings: () => Effect.void,
  updateSkillEntry: () => Effect.void,
  setSkillEntry: () => Effect.void,
  renameSkill: () => Effect.void,
  updateLockEntryAgents: () => Effect.void,
  addConfiguredAgent: () => Effect.void,
  getConfiguredPacks: () => Effect.succeed({}),
  getInstalledPacks: () => Effect.succeed({}),
  getLockedExtensionPacks: () => Effect.succeed({}),
  getLockedExtensionPack: () => Effect.succeed(Option.none()),
  setExtensionPack: () => Effect.void,
  removeExtensionPack: () => Effect.void,
  getExtensionPackDir: () => Effect.succeed({ canonicalPath: "" }),
  getLockedCommands: () => Effect.succeed({}),
  getLockedCommand: () => Effect.succeed(Option.none()),
  setCommand: () => Effect.void,
  setCommandLock: () => Effect.void,
  removeCommand: () => Effect.void,
  updateCommandEntry: () => Effect.void,
  setCommandEntry: () => Effect.void,
  getLockedSubagents: () => Effect.succeed({}),
  getLockedSubagent: () => Effect.succeed(Option.none()),
  setSubagent: () => Effect.void,
  setSubagentLock: () => Effect.void,
  removeSubagent: () => Effect.void,
  updateSubagentEntry: () => Effect.void,
  setSubagentEntry: () => Effect.void,
  removeSubagentSettings: () => Effect.void,
  removeSubagentLock: () => Effect.void,
  getLockedMcpServers: () => Effect.succeed({}),
  getLockedMcpServer: () => Effect.succeed(Option.none()),
  setMcpServer: () => Effect.void,
  setMcpServerLock: () => Effect.void,
  removeMcpServer: () => Effect.void,
  removeSkillLock: () => Effect.void,
  removeCommandSettings: () => Effect.void,
  removeCommandLock: () => Effect.void,
  removeMcpServerSettings: () => Effect.void,
  removeMcpServerLock: () => Effect.void,
  removeExtensionPackSettings: () => Effect.void,
  removeExtensionPackLock: () => Effect.void,
  isExtensionRequiredByInstalledExtensionPack: () => Effect.succeed(false),
  markDependencyRetainedInLockfile: () => Effect.void,
  getConfiguredCommands: () => Effect.succeed({}),
  getConfiguredMcpServers: () => Effect.succeed({}),
  ...overrides,
});
