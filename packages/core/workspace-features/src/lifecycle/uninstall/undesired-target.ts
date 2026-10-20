/**
 * Refusing to uninstall an installed package the workspace does not configure.
 *
 * Uninstall withdraws desired intent. An installed package that no desired
 * route reaches is not intent to withdraw; sync reconciles it, so uninstall
 * refuses before planning rather than reporting a removal it cannot own.
 */

import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import {
  DesiredStateReader,
  WorkspaceLocation,
  LockfileReader,
  observeInstallRoot,
} from "@agentxm/workspace-kernel/workspace-state";

import {
  parseExtensionFqnParts,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";

import { installRefused, OperationRefused } from "@agentxm/workspace-kernel/operations";

/** The single extension a literal uninstall selector names. */
export interface UninstallSubject {
  readonly type: InstallableExtensionType;
  readonly name: string;
  /** The owner handle, when the selector spelled a fully qualified name. */
  readonly owner: string | undefined;
}

/**
 * A typed selector, settled once for every kind: what the kind's parser reads
 * and, unless the selector is a glob, the one subject it names.
 */
export interface TypedUninstallSelector {
  /**
   * A name or a glob for the kind's parser. A fully qualified name of the
   * route's type is read as its extension name; a Pack keeps the qualified
   * spelling, because its owner selects among Pack identities.
   */
  readonly selector: string;
  readonly subject: UninstallSubject | undefined;
}

/**
 * Read a typed selector: an extension name, a glob over names, or a fully
 * qualified name of the route's type. A fully qualified name of another type
 * names nothing this route can remove, so it is refused.
 */
export const typedUninstallSelector = (
  type: InstallableExtensionType,
  selector: string,
): Effect.Effect<TypedUninstallSelector, OperationRefused> => {
  const trimmed = selector.trim();
  if (trimmed.includes("*")) return Effect.succeed({ selector: trimmed, subject: undefined });
  const fqn = parseExtensionFqnParts(trimmed);
  if (fqn === undefined)
    return Effect.succeed({
      selector: trimmed,
      subject: { type, name: trimmed, owner: undefined },
    });
  if (fqn.type !== type)
    return Effect.fail(
      installRefused({
        category: "validation",
        detail: `Expected a ${type} identity, received ${trimmed}`,
      }),
    );
  return Effect.succeed({
    selector: type === "pack" ? trimmed : fqn.name,
    subject: { type, name: fqn.name, owner: fqn.owner },
  });
};

const readFailed = (cause: unknown) =>
  installRefused({
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
  const location = yield* WorkspaceLocation;
  const layout = yield* Ref.get(location.layout);
  const desiredState = yield* DesiredStateReader;
  const graph = yield* desiredState.graph().pipe(Effect.mapError(readFailed));
  if (graph.nodes.some((node) => node.type === subject.type && node.name === subject.name)) return;
  const inventory = yield* observeInstallRoot({
    layout: layout,
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
  return yield* installRefused({
    category: "conflict",
    title: "Extension is not configured",
    detail: `${subject.type} ${identity} is installed but not configured; axm sync removes installed packages that are not configured.`,
    cmd: "axm sync",
  });
});
