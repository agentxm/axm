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
  formatDesiredIdentity,
  desiredMcpSource,
  McpSourceIdentity,
  McpSourceKey,
  WorkspaceLocation,
  type DesiredStateGraph,
} from "@agentxm/workspace-kernel/workspace-state";
import { McpConnectionConflict } from "./errors.js";
import {
  settleMcpSourceIdentity,
  type McpSourceAdmissionCodec,
} from "./lifecycle/domain/source-admission.js";

/** How a structured source is shown in a refusal; never its key. */
const formatMcpSourceIdentity = (identity: McpSourceIdentity): string => {
  const pkg = `${identity.owner ?? ""}/mcps/${identity.name}`;
  switch (identity.kind) {
    case "registry":
      return `${pkg} from ${identity.endpoint.href}`;
    case "git":
      return `${pkg} from ${identity.url.href}`;
    case "path":
      return `${pkg} from ${identity.path}`;
    case "workspace":
      return `workspace:${pkg}`;
  }
};

const admissionCodec: McpSourceAdmissionCodec<McpSourceIdentity, McpSourceKey> = {
  encode: McpSourceKey.encode,
  equals: McpSourceIdentity.equals,
  display: formatMcpSourceIdentity,
};

/**
 * The structured source a selected request names: the same fields its
 * accepted row will record, derived before any install writes.
 */
export const requestedMcpSourceIdentity = (
  ref: McpServerExtensionRef,
  sourceForIdentity?: Source,
): Effect.Effect<McpSourceIdentity, never, WorkspaceLocation | Path.Path> =>
  Effect.gen(function* () {
    switch (ref.refType) {
      case "registry":
        return {
          kind: "registry",
          endpoint:
            sourceForIdentity?.type === "registry"
              ? sourceForIdentity.location
              : ref.source.location,
          owner: ref.owner,
          name: ref.server.name,
        };
      case "workspace":
        return { kind: "workspace", owner: ref.owner, name: ref.server.name };
      case "local": {
        const location = yield* WorkspaceLocation;
        const path = yield* Path.Path;
        return {
          kind: "path",
          path:
            ref.sourcePath ??
            Option.getOrElse(
              makeWorkspaceRelativeSourcePath(
                path,
                location.baseDir,
                fromFileLocation(ref.location),
              ),
              () => ref.source.path,
            ),
          owner: ref.owner,
          name: ref.name,
        };
      }
      case "git-hosted":
        return { kind: "git", url: ref.source.url, owner: ref.owner, name: ref.name };
    }
  });

/**
 * Admit a request for one local connection against the graph's existing
 * connection of that name, and settle the source closure it joins. The
 * request is matched by structured location, never by comparing locator text
 * with a key, so an update or reinstall matches its own accepted source.
 */
export const settleMcpSourceIdentityFor = (
  graph: DesiredStateGraph,
  ref: McpServerExtensionRef,
  localName: ExtensionName,
  sourceForIdentity?: Source,
): Effect.Effect<McpSourceKey, McpConnectionConflict, WorkspaceLocation | Path.Path> =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const path = yield* Path.Path;
    const existingNode = graph.nodes.find(
      (node) => node.type === "mcp-server" && node.name === localName,
    );
    return yield* settleMcpSourceIdentity({
      localName,
      requested: yield* requestedMcpSourceIdentity(ref, sourceForIdentity),
      requestedLocalPath:
        ref.refType === "local"
          ? path.resolve(location.baseDir, ref.sourcePath ?? fromFileLocation(ref.location))
          : null,
      requestedLocator: ref.refType === "workspace" ? "workspace" : printSourceParams(ref.source),
      existing:
        existingNode === undefined
          ? undefined
          : existingNode.authority === "inline"
            ? { kind: "inline" }
            : {
                kind: "sourced",
                identity: desiredMcpSource(existingNode.identity),
                localPath:
                  existingNode.identity.authority === "path"
                    ? path.resolve(location.baseDir, existingNode.identity.locator)
                    : null,
                locator: existingNode.source,
                display: formatDesiredIdentity(existingNode.identity),
              },
      codec: admissionCodec,
    }).pipe(Effect.mapError((conflict) => new McpConnectionConflict(conflict)));
  });
