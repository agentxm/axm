/**
 * Native MCP declarations, and the discovery an import decides over.
 *
 * The workspace-configuration feature discovers unmanaged native connections
 * and hands the result to the authoring feature as plain data. These helpers
 * write the native files a person actually has and build the same shaped
 * discovery from them, so a specification exercises the conversion the
 * application performs without importing a peer feature.
 *
 * @internal Test-only. Not part of the package's public API.
 */

import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { NativeMcpDiscovery } from "../import/import-native-extension.js";
import type { AuthoringWorkspace } from "./authoring-workspace.js";

/** Public, non-secret values; these fixtures do not exercise secret policy. */
export const importedRemote = {
  url: "https://mcp.example.test/context",
  headers: { "X-Workspace": "review-team", "X-View": "complete" },
} as const;

/** The native connection key the fixtures declare. */
export const NATIVE_MCP_KEY = "native-context";

/** The agent config files a `claude-code` + `cursor` workspace contributes. */
export const NATIVE_MCP_FILES = [".mcp.json", ".cursor/mcp.json"] as const;

/** Declare one native remote MCP server in an agent's own config file. */
export const writeNativeRemoteMcp = (
  workspace: AuthoringWorkspace,
  relative = ".mcp.json",
  name = NATIVE_MCP_KEY,
): void => {
  workspace.write(relative, JSON.stringify({ mcpServers: { [name]: importedRemote } }));
};

const nativeConfig = Schema.Struct({ mcpServers: Schema.Record(Schema.String, Schema.Unknown) });

/** The native servers one agent config file currently declares. */
export const readNativeMcpServers = (
  workspace: AuthoringWorkspace,
  relative = ".mcp.json",
): Readonly<Record<string, unknown>> => {
  const contents = workspace.read(relative);
  return contents === undefined
    ? {}
    : Schema.decodeUnknownSync(nativeConfig)(JSON.parse(contents)).mcpServers;
};

const authoredEntries = Schema.Struct({
  mcpServers: Schema.Record(
    Schema.String,
    Schema.Union([
      Schema.String,
      Schema.Struct({
        source: Schema.String,
        enabled: Schema.optional(Schema.Boolean),
        env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
      }),
    ]),
  ),
});

/** The workspace declaration one imported MCP package carries. */
export const readImportedMcpDeclaration = (
  workspace: AuthoringWorkspace,
  name = "context",
): { readonly source: string; readonly enabled: boolean } => {
  const entry = Schema.decodeUnknownSync(authoredEntries)(workspace.settings()).mcpServers[name];
  if (entry === undefined) throw new Error(`Expected authored MCP declaration ${name}`);
  return typeof entry === "string"
    ? { source: entry, enabled: true }
    : { source: entry.source, enabled: entry.enabled !== false };
};

/**
 * The discovery the configuration feature produces for the native files this
 * workspace holds: one remote candidate, declared in every agent config that
 * names it.
 */
export const nativeMcpDiscovery = (
  workspace: AuthoringWorkspace,
  name = NATIVE_MCP_KEY,
): NativeMcpDiscovery => ({
  candidates: [
    {
      name,
      remote: Option.some({ url: importedRemote.url, headers: importedRemote.headers }),
      env: {},
      entries: NATIVE_MCP_FILES.filter((relative) =>
        Object.hasOwn(readNativeMcpServers(workspace, relative), name),
      ).map((relative) => ({
        filePath: `${workspace.root}/${relative}`,
        serversKey: "mcpServers",
        name,
      })),
    },
  ],
  conflicts: [],
});
