import { describe, expect, it } from "vitest";
import { AGENTS } from "@agentxm/extension-model/unstable/agents/registry";
import { userScopeRefusal, type UserScopedExtension } from "./scope-refusal.js";
import {
  CONFIGURABLE_AGENT_IDS,
  type ConfigurableAgentId,
} from "@agentxm/extension-model/unstable/agents/types";

/**
 * The population under test is every catalog agent AXM actually resolves a
 * directory for — the capability is `axm.status: "supported"` and carries a
 * directory, which is exactly when `deriveAgentDescriptor` emits the descriptor
 * slot. Agents whose capability AXM does not support have no slot and are never
 * asked for a scope.
 */
const scopesFor = (id: ConfigurableAgentId): ReadonlyArray<string> | undefined => {
  const descriptor = AGENTS[id];
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
  it("covers the AXM-supported catalog population it claims to", () => {
    expect({
      subagentsWithUser: declaringUserScope().length,
      subagentsWithoutUser: withoutUserScope().length,
    }).toEqual({
      subagentsWithUser: 27,
      subagentsWithoutUser: 0,
    });
  });

  for (const type of ["subagents"] satisfies ReadonlyArray<UserScopedExtension>) {
    it(`names AXM as the limitation for agents with a native user-scope ${type} surface`, () => {
      const messages = declaringUserScope().map((id) => {
        const name = AGENTS[id].name;
        return [id, userScopeRefusal({ agentId: id, agentName: name, type })] as const;
      });
      expect(messages.length).toBeGreaterThan(0);
      for (const [id, message] of messages) {
        const name = AGENTS[id].name;
        expect(message).toBe(
          `AXM manages only the project-scope ${type} directory for ${name}; ${name} supports user-scope ${type} natively but AXM has not modeled that location`,
        );
      }
    });
  }

  it("keeps the plain refusal for an agent with no modeled directory", () => {
    expect(
      userScopeRefusal({ agentId: "universal", agentName: "Universal", type: "subagents" }),
    ).toBe("Universal does not support user-scope subagents");
  });
});
