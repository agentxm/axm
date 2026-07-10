/**
 * Helpers for managed-region marker extension identifiers.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { ExtensionName, ExtensionType } from "./common.js";
import { formatFqn } from "./fqn.js";
import type { Handle } from "./handle.js";

export type MarkerFqnRef =
  | { readonly refType: "registry" | "workspace"; readonly owner: Handle }
  | { readonly refType: "git-hosted" | "local" };

export const markerFqnForRef = (args: {
  readonly ref: MarkerFqnRef;
  readonly manifest: {
    readonly owner: Handle;
    readonly name: ExtensionName;
  };
  readonly type: ExtensionType;
  readonly name: ExtensionName;
}): string =>
  args.ref.refType === "registry" || args.ref.refType === "workspace"
    ? formatFqn({ owner: args.ref.owner, type: args.type, name: args.name })
    : formatFqn({ owner: args.manifest.owner, type: args.type, name: args.manifest.name });
