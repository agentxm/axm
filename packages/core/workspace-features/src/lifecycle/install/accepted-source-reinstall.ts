import {
  extensionRefName,
  type ExtensionRef,
} from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
/**
 * Reconstructing a forced immutable-source reinstall from accepted lock authority.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { toFileLocation } from "@agentxm/host-primitives";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { expandGlobs } from "@agentxm/extension-model/unstable/extensions/name-patterns";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";
import type { GitSource, HttpSource } from "@agentxm/extension-model/unstable/sources/types";
import {
  DesiredStateReader,
  acceptedLockedResolutionRef,
} from "@agentxm/workspace-kernel/workspace-state";
import { hydrateAcceptedPackRef } from "@agentxm/workspace-kernel/resolution";
import { SourceHostProviders } from "@agentxm/workspace-kernel/sources";
import { installRefused } from "@agentxm/workspace-kernel/operations";
import { sourceResolutionRefused } from "@agentxm/workspace-kernel/reconciliation";

const sameLocator = (left: GitSource | HttpSource, right: GitSource | HttpSource): boolean => {
  if (left.type === "http" && right.type === "http")
    return (
      left.url.href === right.url.href &&
      left.kind === right.kind &&
      (right.entry === undefined || left.entry === right.entry)
    );
  return (
    left.type === "git" &&
    right.type === "git" &&
    left.url.href === right.url.href &&
    Option.getOrUndefined(left.ref) === Option.getOrUndefined(right.ref) &&
    Option.getOrUndefined(left.subPath) === Option.getOrUndefined(right.subPath)
  );
};

const reacquireAcceptedSourceRef = (
  ref: Extract<ExtensionRef, { readonly refType: "git-hosted" | "http" }>,
  configuredName: string,
) =>
  Effect.gen(function* () {
    const sources = yield* SourceHostProviders;
    const lockedCandidate =
      ref.type === "pack" ? yield* hydrateAcceptedPackRef(configuredName, ref) : ref;
    if (lockedCandidate.refType !== "git-hosted" && lockedCandidate.refType !== "http") {
      return yield* installRefused({
        category: "conflict",
        detail: `Accepted source resolution for ${configuredName} changed source family`,
      });
    }
    const fetched = yield* sources
      .fetch(lockedCandidate)
      .pipe(Effect.mapError((cause) => sourceResolutionRefused(cause)));
    return {
      ...lockedCandidate,
      location: toFileLocation(fetched.directory),
    } satisfies ExtensionRef;
  });

/** Find matching accepted refs before any movable selector is resolved. */
export const findSourceReinstallRefs = (
  source: GitSource | HttpSource,
  type: ExtensionType,
  names: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const desired = yield* DesiredStateReader;
    const graph = yield* desired.graph();
    const nodes = graph.nodes.filter((node) => node.type === type);
    const selectedNames = expandGlobs(
      names,
      nodes.map((node) => node.name),
    );
    const accepted = yield* Effect.forEach(
      nodes,
      (node) =>
        acceptedLockedResolutionRef({ type: node.type, name: node.name }).pipe(
          Effect.mapError((cause) =>
            installRefused({
              category: "conflict",
              detail: `Accepted source resolution for ${node.name} could not be read`,
              cause,
            }),
          ),
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.succeed(Option.none<ExtensionRef>()),
              onSome: (ref) =>
                (ref.refType === "git-hosted" || ref.refType === "http") &&
                sameLocator(ref.source, source) &&
                (names.length === 0 ||
                  selectedNames.includes(node.name) ||
                  (ref.type === "skill" &&
                    ref.sourcePath !== undefined &&
                    names.includes(ref.sourcePath)))
                  ? reacquireAcceptedSourceRef(ref, node.name).pipe(Effect.map(Option.some))
                  : Effect.succeed(Option.none<ExtensionRef>()),
            }),
          ),
        ),
      { concurrency: 1 },
    );
    return accepted.filter(Option.isSome).map((ref) => ref.value);
  });

/** Use a matching accepted ref and make its recorded content available locally. */
export const pinSourceReinstallRef = (
  ref: ExtensionRef,
  configuredName: string = extensionRefName(ref),
) =>
  Effect.gen(function* () {
    if (ref.refType !== "git-hosted" && ref.refType !== "http") return ref;
    const accepted = yield* acceptedLockedResolutionRef({
      type: ref.type,
      name: configuredName,
    }).pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "conflict",
          detail: `Accepted source resolution for ${configuredName} could not be read`,
          cause,
        }),
      ),
    );
    if (
      Option.isNone(accepted) ||
      (accepted.value.refType !== "git-hosted" && accepted.value.refType !== "http") ||
      accepted.value.type !== ref.type ||
      !sameLocator(accepted.value.source, ref.source)
    ) {
      return ref;
    }

    return yield* reacquireAcceptedSourceRef(accepted.value, configuredName);
  });
