import * as fs from "node:fs";
import * as path from "node:path";
import * as Schema from "effect/Schema";
import { McpServerManifestSchema } from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import { PlanResolutionDocumentSchema, writeWorkspaceFiles } from "axm.sh/specification-harness";
import { makeDirectoryFixture } from "./directory-harness.js";

/** Public, non-secret values; this fixture does not exercise secret import policy. */
export const importedRemote = {
  url: "https://mcp.example.test/context",
  headers: { "X-Workspace": "review-team", "X-View": "complete" },
} as const;

export const writeNativeRemoteMcp = (
  root: string,
  relative = ".mcp.json",
  name = "native-context",
): void => {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify({ mcpServers: { [name]: importedRemote } }));
};

const readJson = (absolute: string): unknown => JSON.parse(fs.readFileSync(absolute, "utf8"));
const nativeConfig = Schema.Struct({ mcpServers: Schema.Record(Schema.String, Schema.Unknown) });

export const readNativeMcpServers = (root: string, relative = ".mcp.json") => {
  const target = path.join(root, relative);
  return fs.existsSync(target)
    ? Schema.decodeUnknownSync(nativeConfig)(readJson(target)).mcpServers
    : {};
};

export const readImportedMcpManifest = (root: string, name = "context") =>
  Schema.decodeUnknownSync(McpServerManifestSchema)(
    readJson(path.join(root, "mcps", name, "mcp.json")),
  );

const authoredEntries = Schema.Struct({
  mcpServers: Schema.Record(
    Schema.String,
    Schema.Union([
      Schema.String,
      Schema.Struct({ source: Schema.String, enabled: Schema.optional(Schema.Boolean) }),
    ]),
  ),
});

export const readImportedMcpDeclaration = (root: string, name = "context") => {
  const entry = Schema.decodeUnknownSync(authoredEntries)(readJson(path.join(root, "axm.json")))
    .mcpServers[name];
  if (entry === undefined) throw new Error(`Expected authored MCP declaration ${name}`);
  return typeof entry === "string"
    ? { source: entry, enabled: true }
    : { source: entry.source, enabled: entry.enabled !== false };
};

export const readMcpImportResolution = (stdout: string) => {
  const input: unknown = JSON.parse(stdout);
  return Schema.decodeUnknownSync(PlanResolutionDocumentSchema)(input).result;
};

export const makeMcpPackageImportProcessFixture = () => {
  const fixture = makeDirectoryFixture();
  writeWorkspaceFiles(fixture.selected, { owner: "@acme", agents: ["claude-code", "cursor"] });
  writeNativeRemoteMcp(fixture.selected);
  return {
    ...fixture,
    importPackage: (options: ReadonlyArray<string> = [], target = "@acme/mcps/context") =>
      fixture.run([
        "-C",
        fixture.selected,
        "mcps",
        "import",
        "--as",
        target,
        ...options,
        "--non-interactive",
        "--json",
      ]),
  };
};
