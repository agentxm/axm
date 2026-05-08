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
import { makeCodingAgentStub } from "../../test-helpers.js";
import type { WorkspaceMutationsService } from "../../workspace/service-interface.js";
import { makeBaseWorkspaceMock } from "../../workspace/test-stubs.js";

// -----------------------------------------------------------------------------
// makeStubAgent
// -----------------------------------------------------------------------------

/** Stub CodingAgent with configurable addCommand/removeCommand behavior. */
export const makeStubAgent = (id: AgentId): CodingAgent =>
  makeCodingAgentStub(id, {
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
    return Effect.fail(
      makeAppError({
        code: "AGENT_NOT_FOUND",
        category: "not_found",
        what: `Agent ${id} not found`,
      }),
    );
  },
  all: Effect.succeed(agents),
  getConfiguredAgents: () => Effect.succeed(agents),
  getUnknownConfiguredAgentIds: () => Effect.succeed([]),
});

// -----------------------------------------------------------------------------
// makeWorkspaceMock
// -----------------------------------------------------------------------------

/**
 * Creates a WorkspaceMutationsService mock with no-op defaults.
 * All methods return sensible defaults; pass `overrides` to customize
 * specific methods for a given test.
 */
export const makeWorkspaceMock = (
  axmDir: string,
  overrides?: Partial<WorkspaceMutationsService> & Partial<WorkspaceMutationsService["records"]>,
): WorkspaceMutationsService =>
  makeBaseWorkspaceMock(axmDir, {
    baseDir: path.dirname(axmDir),
    getConfiguredOwner: () => Effect.succeed(Option.none()),
    ...overrides,
  });
