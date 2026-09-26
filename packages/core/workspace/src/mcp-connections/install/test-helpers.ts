import * as Effect from "effect/Effect";
import type { CodingAgent } from "../../projection/agent-adapters/index.js";
import type { MaterializationTargetId } from "@agentxm/extension-model/unstable/agents/types";

export const makeCodingAgentStub = (
  id: MaterializationTargetId,
  overrides?: Partial<CodingAgent>,
): CodingAgent => ({
  id,
  resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
    Effect.succeed({ _tag: "supported", dir: `${workspaceRoot}/.${id}/skills` }),
  resolveEffectiveSubagentsDir: ({ workspaceRoot }) =>
    Effect.succeed({
      _tag: "supported",
      dir: `${workspaceRoot}/.${id}/agents`,
      warnings: [],
    }),
  addSubagent: ({ workspaceRoot, input }) =>
    Effect.succeed({
      _tag: "success",
      renderedFilePaths: [`${workspaceRoot}/.${id}/agents/${input.name}.md`],
      warnings: [],
    }),
  removeSubagent: () =>
    Effect.succeed({
      _tag: "success",
      renderedFilePaths: [],
      warnings: [],
    }),
  ...overrides,
});
