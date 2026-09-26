/**
 * The starter manifest a new MCP server is created with.
 *
 * The scaffold declares a placeholder npm stdio package under an example
 * reverse-DNS server name: a new server has no published artifact yet, and
 * the author replaces both before publishing.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Path from "effect/Path";

import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  MCP_SERVER_MANIFEST_FILENAME,
  MCP_SERVER_MANIFEST_SCHEMA_URL,
  MCP_SERVER_REGISTRY_SERVER_SCHEMA_URL,
  type McpServerManifest,
} from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";

import { manifestText, stageFileAt, type AuthoredScaffold } from "./scaffold.js";

const INITIAL_VERSION = decodeVersionSync("0.1.0");
const PLACEHOLDER_SERVER_NAMESPACE = "io.github.example";

export const mcpServerScaffold = (args: {
  readonly name: string;
  readonly owner: Handle;
  readonly description: string;
}): AuthoredScaffold => {
  const description = args.description || `MCP server ${args.name}`;
  const manifest: McpServerManifest = {
    $schema: MCP_SERVER_MANIFEST_SCHEMA_URL,
    owner: args.owner,
    type: "mcp-server",
    name: decodeExtensionNameSync(args.name),
    version: INITIAL_VERSION,
    description,
    license: "MIT",
    server: {
      $schema: MCP_SERVER_REGISTRY_SERVER_SCHEMA_URL,
      name: `${PLACEHOLDER_SERVER_NAMESPACE}/${args.name}`,
      description,
      version: INITIAL_VERSION,
      packages: [
        {
          registryType: "npm",
          identifier: args.name,
          version: INITIAL_VERSION,
          transport: { type: "stdio" },
        },
      ],
    },
  };
  return {
    subject: "MCP server",
    version: INITIAL_VERSION,
    contentFiles: [MCP_SERVER_MANIFEST_FILENAME],
    entryFile: MCP_SERVER_MANIFEST_FILENAME,
    populate: (stagingPath) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        yield* stageFileAt({
          path: path.join(stagingPath, MCP_SERVER_MANIFEST_FILENAME),
          contents: manifestText(manifest),
        });
      }),
  };
};
