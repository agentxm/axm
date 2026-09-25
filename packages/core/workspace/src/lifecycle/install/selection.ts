/**
 * Selecting extensions from a discovered source.
 *
 * The command grammar names selectors by extension type. This module owns the
 * shared policy for the types whose feature planners do not already have a
 * selection port: explicit selectors win, --all accepts the complete set,
 * unattended requests must be explicit, and interactive requests ask.
 */

import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

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

const extensionRefDescription = (ref: ExtensionRef): Option.Option<string> => {
  switch (ref.type) {
    case "skill":
      return ref.skill.description;
    case "subagent":
      return ref.subagent.description;
    case "mcp-server":
    case "rule":
    case "hook":
    case "knowledge":
    case "pack":
      return Option.none();
  }
};

export const selectInstallRefs = <Ref extends ExtensionRef>(
  refs: ReadonlyArray<Ref>,
  request: {
    readonly type: InstallableExtensionType;
    readonly selectors: ReadonlyArray<string>;
    readonly all: boolean;
    readonly nonInteractive: boolean;
  },
): Effect.Effect<ReadonlyArray<Ref>, InstallSelectionFailure, InstallSelectionInteraction> =>
  Effect.gen(function* () {
    if (refs.length === 0) return refs;

    const available = refs.map(extensionRefName);
    if (request.selectors.length > 0) {
      const selected = expandGlobs(request.selectors, available);
      if (selected.length === 0) {
        return yield* installRefused({
          category: "not_found",
          detail: `No ${request.type} selections matched the source`,
          recover: `Available names: ${available.join(", ")}`,
        });
      }
      return refs.filter((ref) => selected.includes(extensionRefName(ref)));
    }

    if (request.all) return refs;
    if (request.nonInteractive) {
      return yield* installRefused({
        category: "usage",
        detail: `A ${request.type} selector or --all is required when no prompt can open`,
        recover: `Repeat --${request.type === "mcp-server" ? "mcp" : request.type} for selected names, or pass --all`,
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
