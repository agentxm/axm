import * as Schema from "effect/Schema";

import {
  AgentIdFromYamlSchema,
  AgentLifecycleSchema,
  UrlSchema,
  type Agent,
} from "@agentxm/extension-model/unstable/agent-capabilities/schema";
import { getSupportedExtensionTypesForAgent } from "@agentxm/extension-model/unstable/agent-capabilities/derive";

export const AgentCatalogSupportSchema = Schema.Struct({
  skill: Schema.Boolean,
  "mcp-server": Schema.Boolean,
  subagent: Schema.Boolean,
  rule: Schema.Boolean,
  hook: Schema.Boolean,
});

export const AgentCatalogEntrySchema = Schema.Struct({
  id: AgentIdFromYamlSchema,
  name: Schema.NonEmptyString,
  vendor: Schema.NonEmptyString,
  homepage: UrlSchema,
  lifecycle: AgentLifecycleSchema,
  support: AgentCatalogSupportSchema,
});

export const AgentCatalogReferenceSchema = Schema.Array(AgentCatalogEntrySchema);

export type AgentCatalogReference = typeof AgentCatalogReferenceSchema.Type;

const compareAgentIds = (left: Agent, right: Agent): number =>
  left.id < right.id ? -1 : left.id === right.id ? 0 : 1;

export const makeAgentCatalogReference = (agents: ReadonlyArray<Agent>): AgentCatalogReference => {
  const entries = [...agents].sort(compareAgentIds).map((agent) => {
    const supportedTypes = new Set(getSupportedExtensionTypesForAgent(agent));
    return {
      id: agent.id,
      name: agent.name,
      vendor: agent.vendor,
      homepage: agent.homepage,
      lifecycle: agent.lifecycle,
      support: {
        skill: supportedTypes.has("skill"),
        "mcp-server": supportedTypes.has("mcp-server"),
        subagent: supportedTypes.has("subagent"),
        rule: supportedTypes.has("rule"),
        hook: supportedTypes.has("hook"),
      },
    };
  });

  return Schema.decodeUnknownSync(AgentCatalogReferenceSchema, {
    onExcessProperty: "error",
  })(entries);
};
