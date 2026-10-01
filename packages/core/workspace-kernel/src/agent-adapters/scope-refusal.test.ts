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
  it("distinguishes documented user locations from unmodeled delegation scopes", () => {
    expect(declaringUserScope()).toEqual(
      expect.arrayContaining(["antigravity", "antigravity-cli", "kiro-cli"]),
    );
    expect(withoutUserScope()).toEqual(
      expect.arrayContaining(["hermes", "minimax-code", "openclaw", "zenflow"]),
    );
    for (const id of withoutUserScope()) {
      expect(declaringUserScope()).not.toContain(id);
    }
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
          `AXM workspace setup manages only project-scope ${type} for ${name}; ${name} supports user-scope ${type} natively`,
        );
      }
    });
  }

  it("does not turn an unestablished native scope into a claim of native absence", () => {
    for (const agentId of ["codemaker", ...withoutUserScope()] as const) {
      const agentName = AGENT_DESCRIPTORS[agentId].name;
      expect(userScopeRefusal({ agentId, agentName, type: "subagents" })).toBe(
        `AXM has not established a native user-scope subagents target for ${agentName}`,
      );
    }
  });
});
