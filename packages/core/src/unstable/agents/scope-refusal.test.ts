import { describe, expect, it } from "vitest";
import { AGENTS } from "./registry.js";
import { userScopeRefusal, type UserScopedExtension } from "./scope-refusal.js";
import { CONFIGURABLE_AGENT_IDS, type ConfigurableAgentId } from "./types.js";

/**
 * The population under test is every catalog agent AXM actually resolves a
 * directory for — the capability is `axm.status: "supported"` and carries a
 * directory, which is exactly when `deriveAgentDescriptor` emits the descriptor
 * slot. Agents whose capability AXM does not support have no slot and are never
 * asked for a scope.
 */
const scopesFor = (
  id: ConfigurableAgentId,
  type: UserScopedExtension,
): ReadonlyArray<string> | undefined => {
  const descriptor = AGENTS[id];
  return type === "commands" ? descriptor.commands?.scopes : descriptor.subagents?.scopes;
};

const declaringUserScope = (type: UserScopedExtension): ReadonlyArray<ConfigurableAgentId> =>
  CONFIGURABLE_AGENT_IDS.filter((id) => scopesFor(id, type)?.includes("user") === true);

const withoutUserScope = (type: UserScopedExtension): ReadonlyArray<ConfigurableAgentId> =>
  CONFIGURABLE_AGENT_IDS.filter((id) => {
    const scopes = scopesFor(id, type);
    return scopes !== undefined && !scopes.includes("user");
  });

describe("userScopeRefusal", () => {
  it("covers the AXM-supported catalog population it claims to", () => {
    // Every AXM-supported subagents agent has a native user-scope surface, and
    // all but one commands agent does — so the old blanket "does not support
    // user-scope" was inaccurate nearly everywhere it fired.
    expect({
      commandsWithUser: declaringUserScope("commands").length,
      commandsWithoutUser: withoutUserScope("commands").length,
      subagentsWithUser: declaringUserScope("subagents").length,
      subagentsWithoutUser: withoutUserScope("subagents").length,
    }).toEqual({
      commandsWithUser: 27,
      commandsWithoutUser: 1,
      subagentsWithUser: 27,
      subagentsWithoutUser: 0,
    });
  });

  for (const type of ["commands", "subagents"] as const) {
    it(`names AXM as the limitation for agents with a native user-scope ${type} surface`, () => {
      const messages = declaringUserScope(type).map((id) => {
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

  it("keeps the plain refusal for a catalog agent with no user-scope commands surface", () => {
    const [id] = withoutUserScope("commands");
    expect(id).toBeDefined();
    if (id === undefined) return;
    const name = AGENTS[id].name;
    expect(userScopeRefusal({ agentId: id, agentName: name, type: "commands" })).toBe(
      `${name} does not support user-scope commands`,
    );
  });

  it("keeps the plain refusal for an agent with no modeled directory", () => {
    expect(
      userScopeRefusal({ agentId: "universal", agentName: "Universal", type: "commands" }),
    ).toBe("Universal does not support user-scope commands");
    expect(
      userScopeRefusal({ agentId: "universal", agentName: "Universal", type: "subagents" }),
    ).toBe("Universal does not support user-scope subagents");
  });
});
