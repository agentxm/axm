import * as Effect from "effect/Effect";
import { codingAgentForId, type CodingAgent } from "@agentxm/workspace-kernel/agent-adapters";
import type { ConfigurableAgentId } from "@agentxm/extension-model/unstable/agent-capabilities/identity";

export const makeCodingAgentStub = (
  id: ConfigurableAgentId,
  overrides?: Partial<CodingAgent>,
): CodingAgent => ({
  id,
  resolveNativeReadLocations: codingAgentForId(id).resolveNativeReadLocations,
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
