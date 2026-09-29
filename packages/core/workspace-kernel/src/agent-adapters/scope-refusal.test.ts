import { describe, expect, it } from "vitest";
import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import { userScopeRefusal, type UserScopedExtension } from "./scope-refusal.js";
import {
  CONFIGURABLE_AGENT_IDS,
  type ConfigurableAgentId,
} from "@agentxm/extension-model/unstable/agents/types";

/**
 * The population under test is every catalog agent with a modeled native
 * Subagent capability. Native scope declarations remain visible independently
 * of whether AXM has a verified writer for that surface.
 */
const scopesFor = (id: ConfigurableAgentId): ReadonlyArray<string> | undefined => {
  const descriptor = AGENT_DESCRIPTORS[id];
  return descriptor.subagents?.scopes;
};

const declaringUserScope = (): ReadonlyArray<ConfigurableAgentId> =>
  CONFIGURABLE_AGENT_IDS.filter((id) => scopesFor(id)?.includes("user") === true);

const withoutUserScope = (): ReadonlyArray<ConfigurableAgentId> =>
  CONFIGURABLE_AGENT_IDS.filter((id) => {
    const scopes = scopesFor(id);
    return scopes !== undefined && !scopes.includes("user");
  });

describe("userScopeRefusal", () => {
  it("covers the native Subagent catalog population it claims to", () => {
    expect({
      subagentsWithUser: declaringUserScope().length,
      subagentsWithoutUser: withoutUserScope().length,
    }).toEqual({
      subagentsWithUser: 32,
      subagentsWithoutUser: 0,
    });
  });

  for (const type of ["subagents"] satisfies ReadonlyArray<UserScopedExtension>) {
    it(`names AXM as the limitation for agents with a native user-scope ${type} surface`, () => {
      const messages = declaringUserScope().map((id) => {
        const name = AGENT_DESCRIPTORS[id].name;
        return [id, userScopeRefusal({ agentId: id, agentName: name, type })] as const;
      });
      expect(messages.length).toBeGreaterThan(0);
      for (const [id, message] of messages) {
        const name = AGENT_DESCRIPTORS[id].name;
        expect(message).toBe(
          `AXM manages only the project-scope ${type} directory for ${name}; ${name} supports user-scope ${type} natively but AXM has not modeled that location`,
        );
      }
    });
  }

  it("keeps the plain refusal for an agent with no modeled directory", () => {
    expect(
      userScopeRefusal({ agentId: "codemaker", agentName: "CodeMaker", type: "subagents" }),
    ).toBe("CodeMaker does not support user-scope subagents");
  });
});
