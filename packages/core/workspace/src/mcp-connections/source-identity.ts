/** Settle one MCP source identity at the request boundary. */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type { ExtensionName } from "@agentxm/extension-model/unstable/extensions";
import type { McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import { makeWorkspaceRelativeSourcePath } from "@agentxm/extension-model/unstable/path-types";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import type { Source } from "@agentxm/extension-model/unstable/sources/types";
import { fromFileLocation } from "@agentxm/host-primitives";
import {
  desiredMcpSourceKey,
  mcpRegistryResolutionKey,
  mcpWorkspaceSourceKey,
  WorkspaceLocation,
  type DesiredStateGraph,
} from "../desired-state/index.js";
import {
  settleMcpSourceIdentity,
  type McpConnectionConflict,
} from "./lifecycle/domain/source-admission.js";

/** Derive a source key from the selected package, before any install writes. */
export const requestedMcpSourceIdentity = (
  ref: McpServerExtensionRef,
  sourceForIdentity?: Source,
): Effect.Effect<string, never, WorkspaceLocation | Path.Path> =>
  Effect.gen(function* () {
    switch (ref.refType) {
      case "registry":
        return mcpRegistryResolutionKey({
          authority:
            sourceForIdentity?.type === "registry"
              ? sourceForIdentity.location
              : ref.source.location,
          owner: ref.owner,
          name: ref.server.name,
        });
      case "workspace":
        return mcpWorkspaceSourceKey(ref.owner, ref.server.name);
      case "local": {
        const location = yield* WorkspaceLocation;
        const path = yield* Path.Path;
        return Option.getOrElse(
          makeWorkspaceRelativeSourcePath(path, location.baseDir, fromFileLocation(ref.location)),
          () => ref.source.path,
        );
      }
      case "git-hosted":
        return printSourceParams(ref.source);
    }
  });

/** Apply the one admission rule using the graph's existing local connection. */
export const settleMcpSourceIdentityFor = (
  graph: DesiredStateGraph,
  ref: McpServerExtensionRef,
  localName: ExtensionName,
  sourceForIdentity?: Source,
): Effect.Effect<string, McpConnectionConflict, WorkspaceLocation | Path.Path> =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const path = yield* Path.Path;
    const existingNode = graph.nodes.find(
      (node) => node.type === "mcp-server" && node.name === localName,
    );
    return yield* settleMcpSourceIdentity({
      localName,
      requestedIdentity: yield* requestedMcpSourceIdentity(ref, sourceForIdentity),
      requestedLocalPath:
        ref.refType === "local" ? path.resolve(fromFileLocation(ref.location)) : null,
      existing:
        existingNode === undefined
          ? undefined
          : {
              sourceIdentity:
                existingNode.authority === "inline"
                  ? null
                  : desiredMcpSourceKey(existingNode.identity),
              localPath:
                existingNode.identity.authority === "path"
                  ? path.resolve(location.baseDir, existingNode.identity.locator)
                  : null,
            },
    });
  });
