import { extensionRefName } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
/**
 * Reconstructing a forced Git reinstall from accepted lock authority.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { pathToFileURL } from "node:url";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions/common";
import type { GitSource } from "@agentxm/extension-model/unstable/sources/types";
import { DesiredStateReader, acceptedLockedResolutionRef } from "../../desired-state/index.js";
import { hydrateAcceptedPackRef } from "../../resolution/index.js";
import { SourceHostProviders } from "../../resolution/sources/index.js";
import { installRefused, sourceResolutionRefused } from "./vocabulary.js";

const sameGitLocator = (left: GitSource, right: GitSource): boolean =>
  left.url.href === right.url.href &&
  Option.getOrUndefined(left.ref) === Option.getOrUndefined(right.ref) &&
  Option.getOrUndefined(left.subPath) === Option.getOrUndefined(right.subPath);

const reacquireAcceptedGitRef = (
  ref: Extract<ExtensionRef, { readonly refType: "git-hosted" }>,
  configuredName: string,
) =>
  Effect.gen(function* () {
    const sources = yield* SourceHostProviders;
    const lockedCandidate =
      ref.type === "pack" ? yield* hydrateAcceptedPackRef(configuredName, ref) : ref;
    if (lockedCandidate.refType !== "git-hosted") {
      return yield* installRefused({
        category: "conflict",
        detail: `Accepted Git resolution for ${configuredName} changed source family`,
      });
    }
    const fetched = yield* sources
      .fetch(lockedCandidate)
      .pipe(Effect.mapError((cause) => sourceResolutionRefused(cause)));
    return {
      ...lockedCandidate,
      location: pathToFileURL(fetched.directory).href,
    } satisfies ExtensionRef;
  });

/** Find matching accepted refs before any movable selector is resolved. */
export const findGitReinstallRefs = (
  source: GitSource,
  type: ExtensionType,
  names: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const desired = yield* DesiredStateReader;
    const graph = yield* desired.graph();
    const nodes = graph.nodes.filter(
      (node) => node.type === type && (names.length === 0 || names.includes(node.name)),
    );
    const accepted = yield* Effect.forEach(
      nodes,
      (node) =>
        acceptedLockedResolutionRef({ type: node.type, name: node.name }).pipe(
          Effect.mapError((cause) =>
            installRefused({
              category: "conflict",
              detail: `Accepted Git resolution for ${node.name} could not be read`,
              cause,
            }),
          ),
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.succeed(Option.none<ExtensionRef>()),
              onSome: (ref) =>
                ref.refType === "git-hosted" && sameGitLocator(ref.source, source)
                  ? reacquireAcceptedGitRef(ref, node.name).pipe(Effect.map(Option.some))
                  : Effect.succeed(Option.none<ExtensionRef>()),
            }),
          ),
        ),
      { concurrency: 1 },
    );
    return accepted.filter(Option.isSome).map((ref) => ref.value);
  });

/** Use a matching accepted Git ref and make its recorded commit available locally. */
export const pinGitReinstallRef = (
  ref: ExtensionRef,
  configuredName: string = extensionRefName(ref),
) =>
  Effect.gen(function* () {
    if (ref.refType !== "git-hosted") return ref;
    const accepted = yield* acceptedLockedResolutionRef({
      type: ref.type,
      name: configuredName,
    }).pipe(
      Effect.mapError((cause) =>
        installRefused({
          category: "conflict",
          detail: `Accepted Git resolution for ${configuredName} could not be read`,
          cause,
        }),
      ),
    );
    if (
      Option.isNone(accepted) ||
      accepted.value.refType !== "git-hosted" ||
      accepted.value.type !== ref.type ||
      !sameGitLocator(accepted.value.source, ref.source)
    ) {
      return ref;
    }

    return yield* reacquireAcceptedGitRef(accepted.value, configuredName);
  });
