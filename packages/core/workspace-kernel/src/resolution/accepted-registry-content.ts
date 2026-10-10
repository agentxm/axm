/** Reinstallation refreshes authorization without accepting different immutable content. */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import { ExtensionResolutionFailed } from "./errors.js";

type RegistryRef = Extract<ExtensionRef, { readonly refType: "registry" }>;

export const requireAcceptedRegistryContent = <T extends RegistryRef>(
  accepted: RegistryRef,
  selected: T,
): Effect.Effect<T, ExtensionResolutionFailed> =>
  accepted.version === selected.version &&
  Option.getOrUndefined(accepted.integrity) === Option.getOrUndefined(selected.integrity)
    ? Effect.succeed(selected)
    : Effect.fail(
        new ExtensionResolutionFailed({
          category: "conflict",
          detail: `Cannot reinstall ${accepted.name}@${accepted.version}: the Registry no longer offers the accepted content identity`,
          recover:
            "Restore the accepted Registry content, or explicitly update to accept a new resolution.",
        }),
      );
