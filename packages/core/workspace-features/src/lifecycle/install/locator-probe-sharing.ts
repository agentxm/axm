/**
 * Serving a locator's type probes of one local path from one broad walk.
 *
 * A root locator install that names no type opens the source once for every
 * installable type, each asking for that type alone. A broad walk of the same
 * tree finds each type's packages in the same order, and every failure a
 * typed walk can raise is also raised by the broad one, so a successful broad
 * walk answers every unfiltered typed question. A failed one answers none:
 * each type then reads its own walk and fails or drops out as it would alone.
 */

import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";

import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { FindOptions } from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type { LocalSource } from "@agentxm/extension-model/unstable/sources/types";
import type { SourceHostProvidersService } from "@agentxm/workspace-kernel/sources";

/** Only a question the broad walk answers by type alone is served from it. */
const answeredByBroadWalk = (
  options: FindOptions,
  accepted: Parameters<SourceHostProvidersService["find"]>[2],
): boolean =>
  options.type !== "*" &&
  options.names.length === 0 &&
  Option.isNone(options.owner) &&
  accepted === undefined;

/**
 * A view of `sources` for one probe loop. Each local path is walked broadly at
 * most once; the walk's refs live only as long as the view, and every answer
 * is a fresh array of the refs of the requested type in walk order.
 */
export const makeLocatorProbeSources = (sources: SourceHostProvidersService) =>
  Effect.sync(() => {
    // By exact source path: the broad walk's refs, or none once it failed.
    const walks = new Map<string, Option.Option<ReadonlyArray<ExtensionRef>>>();
    const broadWalk = (source: LocalSource, options: FindOptions) =>
      Effect.suspend(() => {
        const known = walks.get(source.path);
        if (known !== undefined) return Effect.succeed(known);
        return sources.find(source, { ...options, type: "*" }).pipe(
          Effect.exit,
          Effect.flatMap((exit) => {
            if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause))
              return Effect.failCause(exit.cause);
            const walk = Exit.isSuccess(exit) ? Option.some(exit.value) : Option.none();
            walks.set(source.path, walk);
            return Effect.succeed(walk);
          }),
        );
      });
    const view: SourceHostProvidersService = {
      ...sources,
      find: (source, options, accepted) =>
        source.type === "local" && answeredByBroadWalk(options, accepted)
          ? broadWalk(source, options).pipe(
              Effect.flatMap(
                Option.match({
                  onNone: () => sources.find(source, options, accepted),
                  onSome: (refs) => Effect.succeed(refs.filter((ref) => ref.type === options.type)),
                }),
              ),
            )
          : sources.find(source, options, accepted),
    };
    return view;
  });
