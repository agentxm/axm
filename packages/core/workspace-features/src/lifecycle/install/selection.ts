/**
 * Selecting extensions from a discovered source.
 *
 * The command grammar names selectors by extension type. This module owns the
 * one selection policy every installable type shares: explicit selectors win
 * and must match something, --all accepts what the source offers, an
 * unattended request must be explicit, and an interactive request asks once
 * through one interaction port.
 *
 * A source offers what it authors. Packages it acquired from other publishers
 * stay installable by name, and arrive with a Pack that depends on them, but
 * neither --all nor the question takes them.
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
  sourceHolds,
  type ExtensionRef,
} from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import {
  sourceInheritedMembersNamed,
  type PackRef,
} from "@agentxm/extension-model/unstable/extensions/refs/pack";
import { parseExtensionFqnParts } from "@agentxm/extension-model/unstable/extensions";

import {
  InstallSelectionInteraction,
  installRefused,
  type ExtensionLifecycleFailed,
  type InstallSelectionCancelled,
  type InstallSelectionCandidate,
  type InstallSelectionMember,
  type InstallSelectionUnavailable,
} from "@agentxm/workspace-kernel/operations";

export type InstallSelectionFailure =
  ExtensionLifecycleFailed | InstallSelectionCancelled | InstallSelectionUnavailable;

const extensionRefDescription = (ref: ExtensionRef): Option.Option<string> => {
  switch (ref.type) {
    case "skill":
      return ref.skill.description;
    case "subagent":
      return ref.subagent.description;
    case "mcp-server":
      return Option.fromUndefinedOr(ref.server.description);
    case "rule":
      return Option.fromUndefinedOr(ref.rule.description);
    case "hook":
      return Option.fromUndefinedOr(ref.hook.description);
    case "knowledge":
      return Option.fromUndefinedOr(ref.knowledge.description);
    case "pack":
      return Option.fromUndefinedOr(ref.pack.description);
  }
};

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
 * How to read the heading a ref is offered under: its folder, when every ref
 * has one and they do not all share it. One heading over everything says
 * nothing.
 */
const extensionRefGrouping = (
  refs: ReadonlyArray<ExtensionRef>,
): ((ref: ExtensionRef) => Option.Option<string>) => {
  const folders = refs.map(extensionRefFolder);
  const distinct = new Set(folders.flatMap((folder) => Option.toArray(folder)));
  return folders.every(Option.isSome) && distinct.size > 1
    ? extensionRefFolder
    : () => Option.none();
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

    const offered = refs.filter((ref) => !sourceHolds(ref));
    if (offered.length === 0 && (request.all || !request.nonInteractive)) {
      return yield* installRefused({
        category: "not_found",
        detail: `The source offers no ${plural} of its own; it holds ${available.join(", ")} from other publishers`,
        recover: `Name one with ${selectorFlag(request.type)} to install this source's copy`,
      });
    }
    if (request.all) return offered;
    if (request.nonInteractive) {
      return yield* installRefused({
        category: "usage",
        detail: `${selectorFlag(request.type)} or --all is required to select ${plural} when no prompt can open`,
        recover: `Repeat ${selectorFlag(request.type)} for each name to install, pass --all to take every ${noun}, or rerun from an interactive terminal`,
      });
    }

    const selected = yield* askFor(offered);
    return offered.filter((ref) => isSelected(selected, ref));
  });

// -----------------------------------------------------------------------------
// Everything one source offers
// -----------------------------------------------------------------------------

/**
 * The extensions one Pack installs with it, as the candidates beside it would
 * be named. A member the Pack inherits from its own source view is matched by
 * the rule its resolution uses; any other member is named as it is declared.
 */
const packMembers = (pack: PackRef): ReadonlyArray<InstallSelectionMember> =>
  Object.keys(pack.pack.dependencies).flatMap((fqn) => {
    const parsed = parseExtensionFqnParts(fqn);
    if (parsed === undefined || parsed.type === "pack") return [];
    const inherited =
      pack.refType === "git-hosted" || pack.refType === "local"
        ? sourceInheritedMembersNamed(pack, {
            type: parsed.type,
            owner: parsed.owner,
            name: parsed.name,
          })
        : [];
    const [member] = inherited;
    return [
      {
        type: parsed.type,
        name:
          inherited.length === 1 && member !== undefined ? extensionRefName(member) : parsed.name,
      },
    ];
  });

const candidatesFor = (
  refs: ReadonlyArray<ExtensionRef>,
): ReadonlyArray<InstallSelectionCandidate> => {
  const groupOf = extensionRefGrouping(refs);
  return refs.map((ref) => ({
    type: ref.type,
    name: extensionRefName(ref),
    description: extensionRefDescription(ref),
    group: groupOf(ref),
    brings: ref.type === "pack" ? packMembers(ref) : [],
  }));
};

const isSelected = (selected: ReadonlyArray<InstallSelectionMember>, ref: ExtensionRef): boolean =>
  selected.some(({ type, name }) => type === ref.type && name === extensionRefName(ref));

const askFor = (refs: ReadonlyArray<ExtensionRef>) =>
  Effect.gen(function* () {
    const interaction = yield* InstallSelectionInteraction;
    return yield* interaction.select(candidatesFor(refs));
  });

/**
 * Choose among everything a source offers when the request named nothing, and
 * answer which of its refs the install takes. `--all` takes every Pack and
 * every extension no Pack brings, so nothing is desired both directly and
 * through a Pack unless a person chose it twice; otherwise one question
 * covers every type, Packs first because they are the source's own answer to
 * what belongs together.
 */
export const selectAcrossSourceTypes = (
  refs: ReadonlyArray<ExtensionRef>,
  request: Pick<InstallSelectionRequest, "all">,
): Effect.Effect<
  (ref: ExtensionRef) => boolean,
  InstallSelectionCancelled | InstallSelectionUnavailable,
  InstallSelectionInteraction
> =>
  Effect.gen(function* () {
    const offered = refs.filter((ref) => !sourceHolds(ref));
    const listed = [
      ...offered.filter((ref) => ref.type === "pack"),
      ...offered.filter((ref) => ref.type !== "pack"),
    ];
    if (listed.length === 0) return (_ref: ExtensionRef) => false;
    if (request.all) {
      const brought = listed.flatMap((ref) => (ref.type === "pack" ? packMembers(ref) : []));
      return (ref: ExtensionRef) =>
        offered.includes(ref) && (ref.type === "pack" || !isSelected(brought, ref));
    }
    const selected = yield* askFor(listed);
    return (ref: ExtensionRef) => offered.includes(ref) && isSelected(selected, ref);
  });
