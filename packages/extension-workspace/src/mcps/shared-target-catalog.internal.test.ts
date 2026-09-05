/**
 * Cross-checks the shared MCP writer targets declared in the agent
 * capabilities catalog against the shared-target resolution rules.
 */

import { describe, expect, it } from "@effect/vitest";
import { AGENTS } from "@agentxm/extension-model/unstable/agent-capabilities";
import {
  resolveSharedMcpTarget,
  type SharedMcpTargetMember,
  type SharedMcpTransport,
} from "./shared-target.js";

describe("shared MCP writer targets", () => {
  it("keeps every shared MCP writer target compatible", () => {
    const groups = new Map<string, Array<SharedMcpTargetMember>>();
    for (const agent of AGENTS) {
      const writer = agent.capabilities["mcp-server"].axm.writer;
      if (writer === null) continue;
      for (const target of writer.config.targets) {
        const key = target.scope + ":" + target.path;
        const members = groups.get(key) ?? [];
        members.push({ agentId: agent.id, config: writer.config, target });
        groups.set(key, members);
      }
    }
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      expect(new Set(members.map((member) => member.target.attribution))).toEqual(
        new Set(["shared"]),
      );
      const transports = new Set<SharedMcpTransport>();
      for (const member of members) {
        if (member.config.stdio !== null) transports.add("stdio");
        if (member.config.remote?.urlKey["streamable-http"] !== undefined) {
          transports.add("streamable-http");
        }
        if (member.config.remote?.urlKey.sse !== undefined) transports.add("sse");
      }
      for (const transport of transports) {
        const resolution = resolveSharedMcpTarget({ members, transport });
        expect(
          resolution._tag,
          resolution._tag === "conflict" ? resolution.reason : undefined,
        ).toBe("resolved");
      }
    }
  });
});
