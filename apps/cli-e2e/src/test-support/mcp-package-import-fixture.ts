/**
 * MCP package-import fixtures for built-CLI examples.
 *
 * An end-to-end project observes only shipped artifacts, so this variant
 * writes the workspace itself and decodes only the manifest contract package.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as Schema from "effect/Schema";
import { writeWorkspaceState } from "./protected-state.js";
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

/** The authored MCP manifest fields these examples read back. */
const importedManifest = Schema.Struct({
  owner: Schema.String,
  type: Schema.String,
  name: Schema.String,
  version: Schema.String,
});

export const readImportedMcpManifest = (root: string, name = "context") =>
  Schema.decodeUnknownSync(importedManifest)(readJson(path.join(root, "mcps", name, "mcp.json")));

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

export const makeMcpPackageImportProcessFixture = () => {
  const fixture = makeDirectoryFixture();
  writeWorkspaceState(fixture.selected, { owner: "@acme", agents: ["claude-code", "cursor"] });
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
