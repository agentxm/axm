/**
 * Builders for AXM metadata embedded in agent-native MCP config entries.
 *
 * The metadata shape, key, and read/detection predicates live in the
 * workspace settings semantics (`workspace/mcp-entry-semantics.ts`).
 *
 * @experimental This API is unstable and may change without notice.
 */

import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import type { SourceType } from "@agentxm/extension-model/unstable/sources/types";
import type { AxmMcpMetadata } from "../workspace/mcp-entry-semantics.js";

const sourceTypeFromSettingsSource = (source: string): Exclude<SourceType, "inline"> => {
  if (isWorkspaceSourceLocator(source)) return "workspace";
  switch (source) {
    case "github":
      return "github";
    case "gitlab":
      return "gitlab";
    case "bitbucket":
      return "bitbucket";
    case "azurerepos":
      return "azurerepos";
    case "git":
      return "git";
    case "local":
      return "local";
    case "registry":
      return "registry";
    default:
      return "registry";
  }
};

export const buildAxmMcpMetadata = (args: {
  readonly ext: string;
  readonly source: SourceType;
  readonly ref?: string | undefined;
}): AxmMcpMetadata =>
  args.source === "inline"
    ? { v: 1, managed: true, ext: args.ext, source: "inline" }
    : {
        v: 1,
        managed: true,
        ext: args.ext,
        source: args.source,
        ref: args.ref ?? args.source,
      };

export const buildAxmMcpMetadataFromSettingsSource = (
  source: string,
  serverName: string,
): AxmMcpMetadata =>
  source === "inline"
    ? {
        v: 1,
        managed: true,
        ext: `@workspace/mcps/${serverName}`,
        source: "inline",
      }
    : {
        v: 1,
        managed: true,
        ext: source,
        source: sourceTypeFromSettingsSource(source),
        ref: source,
      };
