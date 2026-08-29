import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { HookManifestSchema } from "../hooks/manifest-schema.js";
import { KnowledgeManifestSchema } from "../knowledge/manifest-schema.js";
import {
  MCP_SERVER_REGISTRY_SERVER_SCHEMA_URL,
  McpServerManifestSchema,
} from "../mcps/manifest-schema.js";
import { PackManifestSchema } from "../packs/manifest-schema.js";
import { RuleManifestSchema } from "../rules/manifest-schema.js";
import { SkillManifestSchema } from "../skills/manifest-schema.js";
import { SubagentManifestSchema } from "../subagents/manifest-schema.js";

const common = { owner: "@acme", name: "example", version: "1.0.0" };

const manifestCase = <A, I>(
  type: string,
  schema: Schema.Codec<A, I>,
  manifest: Readonly<Record<string, unknown>>,
) => ({
  type,
  accepts: (metadata: unknown) =>
    Result.isSuccess(Schema.decodeUnknownResult(schema)({ ...manifest, metadata })),
});

const cases: ReadonlyArray<{
  readonly type: string;
  readonly accepts: (metadata: unknown) => boolean;
}> = [
  manifestCase("skill", SkillManifestSchema, { ...common, type: "skill" }),
  manifestCase("mcp-server", McpServerManifestSchema, {
    ...common,
    type: "mcp-server",
    server: {
      $schema: MCP_SERVER_REGISTRY_SERVER_SCHEMA_URL,
      name: "com.example/server",
      description: "Example server",
      version: "1.0.0",
    },
  }),
  manifestCase("subagent", SubagentManifestSchema, { ...common, type: "subagent" }),
  manifestCase("pack", PackManifestSchema, { ...common, type: "pack", dependencies: {} }),
  manifestCase("rule", RuleManifestSchema, { ...common, type: "rule" }),
  manifestCase("hook", HookManifestSchema, {
    ...common,
    type: "hook",
    runtime: "bash",
    entrypoint: "src/hook.sh",
    bindings: [],
  }),
  manifestCase("knowledge", KnowledgeManifestSchema, {
    ...common,
    type: "knowledge",
    format: { name: "okf", version: "0.2" },
    bundleRoot: "src",
  }),
];

describe("extension manifest metadata integration", () => {
  it.each(cases)("accepts opaque object metadata for $type", ({ accepts }) => {
    expect(accepts({ "com.example/tool": { enabled: true, values: [1, null, "✓"] } })).toBe(true);
  });

  it.each(cases)("rejects non-object metadata for $type", ({ accepts }) => {
    expect(accepts(["invalid"])).toBe(false);
    expect(accepts(null)).toBe(false);
  });
});
