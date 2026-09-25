/**
 * Selecting extensions from a discovered source.
 *
 * The command grammar names selectors by extension type. This module owns the
 * one selection policy every installable type shares: explicit selectors win
 * and must match something, --all accepts the complete set, an unattended
 * request must be explicit, and an interactive request asks through one
 * interaction port.
 */

import * as Context from "effect/Context";
import * as Data from "effect/Data";
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

import type { ExtensionLifecycleFailed } from "../errors.js";
import { installRefused } from "./vocabulary.js";

export interface InstallSelectionCandidate {
  readonly type: InstallableExtensionType;
  readonly name: string;
  readonly description: Option.Option<string>;
}

export class InstallSelectionCancelled extends Data.TaggedError("InstallSelectionCancelled")<{
  readonly message: string;
}> {}

export class InstallSelectionUnavailable extends Data.TaggedError("InstallSelectionUnavailable")<{
  readonly cause?: unknown;
}> {}

export type InstallSelectionFailure =
  ExtensionLifecycleFailed | InstallSelectionCancelled | InstallSelectionUnavailable;

export class InstallSelectionInteraction extends Context.Service<
  InstallSelectionInteraction,
  {
    readonly select: (
      candidates: ReadonlyArray<InstallSelectionCandidate>,
    ) => Effect.Effect<
      ReadonlyArray<InstallSelectionCandidate>,
      InstallSelectionCancelled | InstallSelectionUnavailable
    >;
  }
>()("@agentxm/workspace/lifecycle/install/InstallSelectionInteraction") {}

const extensionRefDescription = (ref: ExtensionRef): Option.Option<string> =>
  ref.type === "skill"
    ? ref.skill.description
    : ref.type === "subagent"
      ? ref.subagent.description
      : Option.none();

/** The flag that names one of this type's extensions on an install command. */
const selectorFlag = (type: InstallableExtensionType): string =>
  type === "mcp-server" ? "--mcp" : `--${type}`;

/** What a request decided before the source's contents were known. */
export interface InstallSelectionRequest {
  readonly type: InstallableExtensionType;
  /** Names or `*` patterns; an empty list means nothing was named. */
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
      const selected = expandGlobs(request.selectors, available);
      if (selected.length === 0) {
        return yield* installRefused({
          category: "not_found",
          detail: `No ${plural} matched: ${request.selectors.join(", ")}. Source contains: ${available.join(", ")}`,
          recover: `Check the ${noun} names or patterns and try again`,
        });
      }
      return refs.filter((ref) => selected.includes(extensionRefName(ref)));
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
    const candidates = refs.map((ref) => ({
      type: request.type,
      name: extensionRefName(ref),
      description: extensionRefDescription(ref),
    }));
    const selected = yield* interaction.select(candidates);
    const names = selected.map(({ name }) => name);
    return refs.filter((ref) => names.includes(extensionRefName(ref)));
  });
