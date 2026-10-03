import * as Option from "effect/Option";
import { parseInputPattern } from "@agentxm/extension-model/unstable/sources/parser";
/**
 * Builders for AXM metadata embedded in agent-native MCP config entries.
 *
 * The metadata shape, key, and read/detection predicates live beside them in
 * `entry-semantics.ts`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import type { SourceType } from "@agentxm/extension-model/unstable/sources/types";
import type { AxmMcpMetadata } from "./entry-semantics.js";

const sourceTypeFromSettingsSource = (source: string): Exclude<SourceType, "inline" | "http"> => {
  if (isWorkspaceSourceLocator(source)) return "workspace";
  const parsed = parseInputPattern(source);
  if (Option.isSome(parsed)) {
    switch (parsed.value.pattern.pattern) {
      case "file-path-pattern":
        return "local";
      case "git-scp-address":
      case "slash-pattern":
      case "shorthand-input":
      case "url-input":
        return "git";
    }
  }
  switch (source) {
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
  readonly source: Exclude<SourceType, "http">;
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
