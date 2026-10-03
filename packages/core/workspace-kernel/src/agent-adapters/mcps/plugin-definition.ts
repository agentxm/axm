/** Read selected plugin MCP entries without converting their upstream files. */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import type { NativeMcpComponent } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import { McpConfigInvalid, McpConfigIoFailed } from "../errors.js";

const PortableContainer = Schema.Struct({
  $schema: Schema.Literal("https://agent-plugins.org/schemas/1.0.0/mcp.schema.json"),
  mcpServers: Schema.Record(Schema.String, Schema.Unknown),
});
const PortableRemote = Schema.Struct({
  type: Schema.Literals(["streamable-http", "sse"]),
  url: Schema.NonEmptyString,
  headers: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
const ObjectValue = Schema.Record(Schema.String, Schema.Unknown);

export type PluginMcpDefinition =
  | {
      readonly kind: "remote";
      readonly transport: "streamable-http" | "sse";
      readonly url: string;
      readonly headers: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: "unsupported";
      readonly reason: string;
    };

const validPortableEndpoint = (value: string): boolean => {
  try {
    const url = new URL(value);
    if (url.username !== "" || url.password !== "" || url.hash !== "") return false;
    if (url.protocol === "https:") return true;
    if (url.protocol !== "http:") return false;
    return (
      // eslint-disable-next-line no-restricted-syntax -- Agent Plugins permits HTTP only for its explicit loopback host forms.
      url.hostname === "localhost" ||
      url.hostname === "[::1]" ||
      /^127(?:\.[0-9]{1,3}){3}$/u.test(url.hostname)
    );
  } catch {
    return false;
  }
};

/** Resolve only the selected declaration; unrelated unsupported entries remain content. */
export const readPluginMcpDefinition = (packageRoot: string, component: NativeMcpComponent) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const invalid = (detail: string, cause?: unknown) => new McpConfigInvalid({ detail, cause });
    const io = (cause: unknown) =>
      new McpConfigIoFailed({
        detail: `Cannot read plugin MCP configuration ${component.configPath}`,
        cause,
      });
    if (component.configPath !== "mcp.json")
      return yield* invalid("Agent Plugins MCP configuration must use root mcp.json");
    const root = yield* fs.realPath(packageRoot).pipe(Effect.mapError(io));
    const config = yield* fs
      .realPath(path.resolve(packageRoot, component.configPath))
      .pipe(Effect.mapError(io));
    const relative = path.relative(root, config);
    if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`))
      return yield* invalid(
        `Plugin MCP configuration escapes its package: ${component.configPath}`,
      );
    const text = yield* fs.readFileString(config).pipe(Effect.mapError(io));
    const raw = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(text).pipe(
      Effect.mapError((cause) =>
        invalid(`Invalid plugin MCP JSON: ${component.configPath}`, cause),
      ),
    );
    const container = yield* Schema.decodeUnknownEffect(PortableContainer)(raw, {
      onExcessProperty: "error",
    }).pipe(
      Effect.mapError((cause) =>
        invalid(`Invalid plugin MCP configuration: ${component.configPath}`, cause),
      ),
    );
    const selected = container.mcpServers[component.name];
    if (selected === undefined)
      return yield* invalid(`Plugin MCP entry is missing: ${component.name}`);
    const object = yield* Schema.decodeUnknownEffect(ObjectValue)(selected).pipe(
      Effect.mapError((cause) => invalid(`Invalid plugin MCP entry: ${component.name}`, cause)),
    );
    if (object["type"] === "stdio" || object["command"] !== undefined)
      return {
        kind: "unsupported",
        reason: `Plugin MCP ${component.name} requires subprocess working-directory and plugin-variable semantics that this native projection does not support`,
      } satisfies PluginMcpDefinition;
    const remote = yield* Schema.decodeUnknownEffect(PortableRemote)(selected, {
      onExcessProperty: "error",
    }).pipe(
      Effect.mapError((cause) =>
        invalid(`Invalid or unsupported plugin MCP entry: ${component.name}`, cause),
      ),
    );
    if (!validPortableEndpoint(remote.url))
      return yield* invalid(
        `Plugin MCP ${component.name} requires an HTTPS endpoint, or loopback HTTP, without user information or a fragment`,
      );
    const names = new Set<string>();
    for (const [name, value] of Object.entries(remote.headers ?? {})) {
      const lower = name.toLowerCase();
      if (
        !/^[!#$%&'*+.^_\x60|~0-9A-Za-z-]+$/u.test(name) ||
        Array.from(value).some((character) => {
          const code = character.charCodeAt(0);
          return (code < 32 && code !== 9) || code === 127;
        }) ||
        names.has(lower)
      )
        return yield* invalid(`Plugin MCP ${component.name} has invalid or duplicate HTTP headers`);
      names.add(lower);
    }
    return {
      kind: "remote",
      transport: remote.type === "sse" ? "sse" : "streamable-http",
      url: remote.url,
      headers: remote.headers ?? {},
    } satisfies PluginMcpDefinition;
  });
