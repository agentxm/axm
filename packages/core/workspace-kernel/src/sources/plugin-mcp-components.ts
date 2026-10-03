import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import type { NativeMcpComponent } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { PluginSkillDistribution } from "./plugin-distribution.js";
import { SourceNotResolvable } from "./errors.js";

const PortableMap = Schema.Struct({
  $schema: Schema.Literal("https://agent-plugins.org/schemas/1.0.0/mcp.schema.json"),
  mcpServers: Schema.Record(Schema.String, Schema.Unknown),
});

/** Portable MCP discovery reads keys only; entry semantics belong to requested activation. */
export const discoverPluginMcpComponents = (
  directory: string,
  distribution: PluginSkillDistribution,
) =>
  Effect.gen(function* () {
    // Vendor-specific MCP loaders have additional merge and variable semantics.
    // The portable fixed location is independent of those host extensions.
    if (distribution.format !== "agent-plugins") return [];
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const invalid = (detail: string, cause?: unknown) =>
      new SourceNotResolvable({ category: "validation", detail, cause });
    const configPath = "mcp.json";
    const config = path.join(directory, configPath);
    if (
      !(yield* fs
        .exists(config)
        .pipe(
          Effect.mapError((cause) => invalid("Cannot inspect plugin MCP configuration", cause)),
        ))
    )
      return [];
    const root = yield* fs
      .realPath(directory)
      .pipe(Effect.mapError((cause) => invalid("Cannot resolve plugin root", cause)));
    const physical = yield* fs
      .realPath(config)
      .pipe(Effect.mapError((cause) => invalid("Cannot resolve plugin MCP configuration", cause)));
    const relative = path.relative(root, physical);
    if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`))
      return yield* invalid("Plugin MCP configuration escapes its package");
    const raw = yield* fs
      .readFileString(config)
      .pipe(Effect.mapError((cause) => invalid("Cannot read plugin MCP configuration", cause)));
    const parsed = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(PortableMap))(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError((cause) => invalid("Invalid Agent Plugins MCP configuration", cause)));
    return Object.keys(parsed.mcpServers)
      .filter((name) => name.length > 0)
      .sort()
      .map((name): NativeMcpComponent => ({
        format: "agent-plugins",
        configPath,
        name,
      }));
  });
