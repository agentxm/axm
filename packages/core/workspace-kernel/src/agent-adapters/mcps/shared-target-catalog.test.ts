/**
 * Cross-checks the shared MCP writer targets declared in the agent
 * capabilities catalog against the shared-target resolution rules.
 */

import { describe, expect, it } from "@effect/vitest";
import { AGENTS } from "@agentxm/extension-model/unstable/agent-capabilities";
import { configuredMcpCapability, declaredMcpWriterTargets } from "./targeting.js";
import {
  resolveSharedMcpTarget,
  type SharedMcpTargetMember,
  type SharedMcpTransport,
} from "./shared-target.js";

describe("shared MCP writer targets", () => {
  it("resolves shared transports and refuses transports missing from a configured reader", () => {
    const groups = new Map<string, Array<SharedMcpTargetMember>>();
    for (const agent of AGENTS) {
      const capability = configuredMcpCapability(agent.id);
      if (capability === undefined) continue;
      for (const { target, config, location } of declaredMcpWriterTargets(capability)) {
        const key = target.scope + ":" + target.path;
        const members = groups.get(key) ?? [];
        members.push({
          agentId: agent.id,
          locationId: location.id,
          configured: true,
          config,
          target,
        });
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
        const commonTransport = members.every(({ config }) =>
          transport === "stdio"
            ? config.stdio !== null
            : config.remote?.urlKey[transport] !== undefined,
        );
        expect(
          resolution._tag,
          resolution._tag === "conflict" ? resolution.reason : undefined,
        ).toBe(commonTransport ? "resolved" : "conflict");
      }
    }
  });
});
