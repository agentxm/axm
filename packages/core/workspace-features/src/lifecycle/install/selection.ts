/**
 * Selecting extensions from a discovered source.
 *
 * The command grammar names selectors by extension type. This module owns the
 * one selection policy every installable type shares: explicit selectors win
 * and must match something, --all accepts the complete set, an unattended
 * request must be explicit, and an interactive request asks through one
 * interaction port.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  extensionTypePluralSentenceLabels,
  extensionTypeSentenceLabels,
  extensionTypeToPlural,
} from "@agentxm/extension-model/unstable/extensions";
import { expandGlobs } from "@agentxm/extension-model/unstable/extensions/name-patterns";
import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  extensionRefName,
  type ExtensionRef,
} from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";

import {
  InstallSelectionInteraction,
  installRefused,
  type ExtensionLifecycleFailed,
  type InstallSelectionCancelled,
  type InstallSelectionUnavailable,
} from "@agentxm/workspace-kernel/operations";

export type InstallSelectionFailure =
  ExtensionLifecycleFailed | InstallSelectionCancelled | InstallSelectionUnavailable;

const extensionRefDescription = (ref: ExtensionRef): Option.Option<string> =>
  ref.type === "skill"
    ? ref.skill.description
    : ref.type === "subagent"
      ? ref.subagent.description
      : Option.none();

/**
 * The folder a source keeps a skill's own folder in. A source that sorts its
 * skills into folders has said how it would have them read.
 */
const extensionRefFolder = (ref: ExtensionRef): Option.Option<string> => {
  if (ref.type !== "skill") return Option.none();
  const path =
    ref.refType === "git-hosted" || ref.refType === "http"
      ? ref.sourcePath
      : ref.refType === "local"
        ? ref.sourceRelativePath
        : undefined;
  const folder = path
    ?.split("/")
    .filter((segment) => segment.length > 0 && segment !== ".")
    .at(-2);
  return folder === undefined ? Option.none() : Option.some(folder);
};

/**
 * The heading each ref is offered under: its folder, when every ref has one
 * and they do not all share it. One heading over everything says nothing.
 */
const extensionRefGroups = (
  refs: ReadonlyArray<ExtensionRef>,
): ReadonlyArray<Option.Option<string>> => {
  const folders = refs.map(extensionRefFolder);
  const distinct = new Set(folders.flatMap((folder) => Option.toArray(folder)));
  return folders.every(Option.isSome) && distinct.size > 1
    ? folders
    : refs.map(() => Option.none());
};

/** The flag that names one of this type's extensions on an install command. */
const selectorFlag = (type: InstallableExtensionType): string =>
  type === "mcp-server" ? "--mcp-server" : `--${type}`;

/** What a request decided before the source's contents were known. */
export interface InstallSelectionRequest {
  readonly type: InstallableExtensionType;
  /** Names, `*` patterns, or exact external skill paths; an empty list means nothing was named. */
  readonly selectors: ReadonlyArray<string>;
  /** Take everything the source offers without asking. */
  readonly all: boolean;
  /** No prompt can open in this invocation. */
  readonly nonInteractive: boolean;
}

export const selectInstallRefs = <Ref extends ExtensionRef>(
  refs: ReadonlyArray<Ref>,
  request: InstallSelectionRequest,
): Effect.Effect<ReadonlyArray<Ref>, InstallSelectionFailure, InstallSelectionInteraction> =>
  Effect.gen(function* () {
    if (refs.length === 0) return refs;

    const available = refs.map(extensionRefName);
    const noun = extensionTypeSentenceLabels[request.type];
    const plural = extensionTypePluralSentenceLabels[extensionTypeToPlural[request.type]];
    if (request.selectors.length > 0) {
      const selectedNames = expandGlobs(request.selectors, available);
      const selected = refs.filter((candidate) => {
        const ref: ExtensionRef = candidate;
        return (
          selectedNames.includes(extensionRefName(ref)) ||
          (ref.type === "mcp-server" &&
            (ref.refType === "local" || ref.refType === "git-hosted") &&
            ref.nativeComponent !== undefined &&
            (request.selectors.includes(ref.nativeComponent.name) ||
              request.selectors.includes(
                `${ref.distribution?.packageRoot ?? ref.sourcePath ?? "."}#${ref.nativeComponent.name}`,
              ))) ||
          (ref.type === "skill" &&
            (((ref.refType === "git-hosted" || ref.refType === "http") &&
              ref.sourcePath !== undefined &&
              request.selectors.includes(ref.sourcePath)) ||
              (ref.refType === "local" &&
                ref.sourceRelativePath !== undefined &&
                request.selectors.includes(ref.sourceRelativePath))))
        );
      });
      if (selected.length === 0) {
        return yield* installRefused({
          category: "not_found",
          detail: `No ${plural} matched: ${request.selectors.join(", ")}. Source contains: ${available.join(", ")}`,
          recover: `Check the ${noun} names or patterns and try again`,
        });
      }
      return selected;
    }

    if (request.all) return refs;
    if (request.nonInteractive) {
      return yield* installRefused({
        category: "usage",
        detail: `${selectorFlag(request.type)} or --all is required to select ${plural} when no prompt can open`,
        recover: `Repeat ${selectorFlag(request.type)} for each name to install, pass --all to take every ${noun}, or rerun from an interactive terminal`,
      });
    }

    const interaction = yield* InstallSelectionInteraction;
    const groups = extensionRefGroups(refs);
    const candidates = refs.map((ref, index) => ({
      type: request.type,
      name: extensionRefName(ref),
      description: extensionRefDescription(ref),
      group: groups[index] ?? Option.none(),
    }));
    const selected = yield* interaction.select(candidates);
    const names = selected.map(({ name }) => name);
    return refs.filter((ref) => names.includes(extensionRefName(ref)));
  });
