/** Accepted refs for an explicit request that repeats existing intent. */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import {
  parseExtensionFqnParts,
  parseRegistrySourceRef,
} from "@agentxm/extension-model/unstable/extensions";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { Source } from "@agentxm/extension-model/unstable/sources/types";
import type { VersionRange } from "@agentxm/extension-model/unstable/version-constraints";
import { acceptedConfiguredResolution } from "@agentxm/workspace-kernel/resolution";
import { DesiredStateReader, desiredPackageKey } from "@agentxm/workspace-kernel/workspace-state";
import { resolveSource } from "@agentxm/workspace-kernel/sources";
import { configuredEntryResolutionRefused } from "@agentxm/workspace-kernel/reconciliation";

const sameSource = (left: Source, right: Source): boolean => {
  switch (left.type) {
    case "registry":
      return (
        right.type === "registry" &&
        left.location.href === right.location.href &&
        Option.getOrUndefined(left.owner) === Option.getOrUndefined(right.owner)
      );
    case "git":
      return (
        right.type === "git" &&
        left.url.href === right.url.href &&
        Option.getOrUndefined(left.ref) === Option.getOrUndefined(right.ref) &&
        Option.getOrUndefined(left.subPath) === Option.getOrUndefined(right.subPath)
      );
    case "local":
      return right.type === "local" && left.path === right.path;
    case "http":
      return (
        right.type === "http" &&
        left.url.href === right.url.href &&
        left.kind === right.kind &&
        left.entry === right.entry
      );
    case "workspace":
      return false;
  }
};

/** Broad discovery remains discovery; only a complete named selection can skip it. */
export const acceptedInstallRequestRefs = (args: {
  readonly type: ExtensionType;
  readonly source: Source;
  readonly names: ReadonlyArray<string>;
  readonly versionRange: Option.Option<VersionRange>;
  readonly localName?: string;
}) =>
  Effect.gen(function* () {
    if (args.names.length === 0 || args.names.some((name) => name.includes("*"))) return [];
    const graph = yield* (yield* DesiredStateReader).graph();
    const refs: Array<ExtensionRef> = [];
    for (const name of args.names) {
      const desired = graph.nodes.find(
        (node) => node.type === args.type && node.name === (args.localName ?? name),
      );
      if (desired?.source === undefined || desired.identity.authority === "workspace") return [];
      // A local MCP connection name is not the selected package identity.
      // Reusing the alias for another package is changed install intent.
      if (parseExtensionFqnParts(desiredPackageKey(desired.identity))?.name !== name) return [];
      const range = parseRegistrySourceRef(desired.source)?.versionRange;
      if (range !== Option.getOrUndefined(args.versionRange)) return [];
      const source = yield* resolveSource(desired.source, { expectedType: args.type });
      if (!sameSource(source, args.source)) return [];
      const accepted = yield* acceptedConfiguredResolution({
        type: args.type,
        name: desired.name,
        desired,
        forceCanonical: false,
      });
      if (Option.isNone(accepted)) return [];
      const ref = accepted.value.ref;
      // Source selection matches the package name; finalization applies the
      // requested connection alias after that selection.
      refs.push(
        ref.type === "mcp-server" ? { ...ref, server: { ...ref.server, name: ref.name } } : ref,
      );
    }
    return refs;
  }).pipe(Effect.mapError(configuredEntryResolutionRefused("requested extension")));
