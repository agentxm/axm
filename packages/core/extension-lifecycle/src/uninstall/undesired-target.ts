/**
 * Refusing to uninstall an installed package the workspace does not configure.
 *
 * Uninstall withdraws desired intent. An installed package that no desired
 * route reaches is not intent to withdraw; sync reconciles it, so uninstall
 * refuses before planning rather than reporting a removal it cannot own.
 */

import * as Effect from "effect/Effect";

import {
  parseExtensionFqnParts,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { LockfileReader, WorkspaceMutations, observeInstallRoot } from "@agentxm/workspace-state";

import { ExtensionLifecycleFailed } from "../errors.js";

/** The single extension a literal uninstall selector names. */
export interface UninstallSubject {
  readonly type: InstallableExtensionType;
  readonly name: string;
  /** The owner handle, when the selector spelled a fully qualified name. */
  readonly owner: string | undefined;
}

/** The subject a typed selector names, or none for a glob. */
export const typedUninstallSubject = (
  type: InstallableExtensionType,
  selector: string,
): UninstallSubject | undefined => {
  const trimmed = selector.trim();
  if (trimmed.includes("*")) return undefined;
  const fqn = parseExtensionFqnParts(trimmed);
  return fqn !== undefined && fqn.type === type
    ? { type, name: fqn.name, owner: fqn.owner }
    : { type, name: trimmed, owner: undefined };
};

const readFailed = (cause: unknown) =>
  new ExtensionLifecycleFailed({
    category: "internal",
    detail: "Installed packages could not be observed",
    cause,
  });

/**
 * Fail when no desired route reaches the subject while an installed package
 * for it sits in the install root.
 */
export const refuseUndesiredInstalledTarget = Effect.fn(
  "UninstallExtensions.refuseUndesiredInstalledTarget",
)(function* (subject: UninstallSubject) {
  const ws = yield* WorkspaceMutations;
  const graph = yield* ws.getDesiredStateGraph().pipe(Effect.mapError(readFailed));
  if (graph.nodes.some((node) => node.type === subject.type && node.name === subject.name)) return;
  const inventory = yield* observeInstallRoot({
    layout: ws.layout,
    graph,
    locks: yield* LockfileReader,
  }).pipe(Effect.mapError(readFailed));
  const installed = inventory.leftovers.some(
    (entry) =>
      entry.type === subject.type &&
      entry.name === subject.name &&
      (subject.owner === undefined || entry.owner === subject.owner),
  );
  if (!installed) return;
  const identity =
    subject.owner === undefined
      ? subject.name
      : `${subject.owner}/${toExtensionTypePlural(subject.type)}/${subject.name}`;
  return yield* new ExtensionLifecycleFailed({
    category: "conflict",
    title: "Extension is not configured",
    detail: `${subject.type} ${identity} is installed but not configured; axm sync removes installed packages that are not configured.`,
    cmd: "axm sync",
  });
});
