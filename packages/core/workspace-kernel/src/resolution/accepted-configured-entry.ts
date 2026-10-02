/** Exact accepted selection for an install of existing workspace intent. */
import { fromFileLocation, toFileLocation } from "@agentxm/host-primitives";
import {
  parseRegistrySourceRef,
  type ExtensionType,
} from "@agentxm/extension-model/unstable/extensions";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  acceptedLockedResolutionRef,
  computeMaterializedTreeIntegrity,
  DesiredStateReader,
  observeDesiredCanonical,
  usableAcceptedCanonicalFrom,
  type DesiredExtensionNode,
} from "../workspace-state/index.js";
import { SourceHostProviders } from "../sources/index.js";
import { ExtensionResolutionFailed } from "./errors.js";
import type { ResolvedConfiguredEntry } from "./configured-entry.js";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";

/**
 * Reuse a satisfying accepted identity before consulting a movable source.
 * A missing row permits first resolution; an incompatible row needs an explicit
 * update. A present usable local copy remains sufficient when its source moves.
 * Install may restore drift, but restoration cannot accept different source bytes.
 */
export const acceptedConfiguredResolution = (args: {
  readonly type: ExtensionType;
  readonly name: string;
  readonly desired?: DesiredExtensionNode;
  readonly forceCanonical?: boolean;
}) =>
  Effect.gen(function* () {
    const desired =
      args.desired ??
      (yield* (yield* DesiredStateReader).graph()).nodes.find(
        (node) => node.type === args.type && node.name === args.name,
      );
    if (
      desired === undefined ||
      desired.source === undefined ||
      desired.identity.authority === "workspace" ||
      desired.identity.authority === "bundled"
    ) {
      return Option.none();
    }
    const canonical = yield* observeDesiredCanonical(desired);
    if (canonical.accepted === undefined) return Option.none();
    const refusal = (detail: string, cause?: unknown) =>
      new ExtensionResolutionFailed({
        category: "conflict",
        detail: `Cannot restore accepted ${args.type} ${args.name}: ${detail}`,
        recover:
          "Restore the accepted source bytes, or explicitly update the extension to accept a new resolution.",
        ...(cause === undefined ? {} : { cause }),
      });
    if (
      canonical.observation.status === "wrong-origin" ||
      canonical.observation.status === "constraint-mismatch"
    ) {
      return yield* refusal(
        "the accepted resolution does not satisfy the configured source and constraints",
      );
    }
    const usable =
      args.forceCanonical === true ? Option.none() : yield* usableAcceptedCanonicalFrom(canonical);
    const accepted = Option.isSome(usable)
      ? Option.some(usable.value.ref)
      : yield* acceptedLockedResolutionRef(args);
    if (Option.isNone(accepted)) return Option.none();
    let ref = accepted.value;
    if (Option.isNone(usable)) {
      if (ref.refType === "git-hosted") {
        const files = yield* (yield* SourceHostProviders)
          .fetch(ref)
          .pipe(
            Effect.mapError((cause) => refusal("its recorded Git commit is unavailable", cause)),
          );
        ref = { ...ref, location: toFileLocation(files.directory) };
      } else if (ref.refType === "local") {
        const integrity = yield* computeMaterializedTreeIntegrity(
          fromFileLocation(ref.location),
        ).pipe(
          Effect.mapError((cause) => refusal("its recorded local source is unavailable", cause)),
        );
        if (integrity !== canonical.accepted.treeIntegrity) {
          return yield* refusal(
            "the available local source does not reproduce the accepted content",
          );
        }
      }
    }
    return Option.some<ResolvedConfiguredEntry<ExtensionRef>>({
      ref,
      versionRange: Option.fromUndefinedOr(parseRegistrySourceRef(desired.source)?.versionRange),
    });
  });
