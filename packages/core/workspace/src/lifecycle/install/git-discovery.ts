/** Share one captured Git checkout across the type probes of a locator install. */

import * as Cache from "effect/Cache";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as ScopedCache from "effect/ScopedCache";

import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { FindOptions } from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type { GitSource } from "@agentxm/extension-model/unstable/sources/types";
import { SourceNetworkFailure } from "../../resolution/sources/errors.js";
import { gitTransportContextFingerprint } from "../../resolution/sources/git/operations.js";
import { shallowClone } from "../../resolution/sources/git/operations.js";
import { discoverConventionRefs } from "../../resolution/sources/providers/convention-discovery.js";
import type { SourceHostProvidersService } from "../../resolution/sources/service.js";

class GitCheckoutKey extends Data.Class<{
  readonly url: string;
  readonly ref: string | undefined;
  readonly transportContext: string;
}> {}

class GitDiscoveryKey extends Data.Class<{
  readonly checkout: GitCheckoutKey;
  readonly subPath: string | undefined;
}> {}

const gitCheckoutKey = (source: GitSource): GitCheckoutKey =>
  new GitCheckoutKey({
    url: source.url.href,
    ref: Option.getOrUndefined(source.ref),
    transportContext: gitTransportContextFingerprint(),
  });

const gitDiscoveryKey = (source: GitSource): GitDiscoveryKey =>
  new GitDiscoveryKey({
    checkout: gitCheckoutKey(source),
    subPath: Option.getOrUndefined(source.subPath),
  });

const matchingGitRefs = (refs: ReadonlyArray<ExtensionRef>, options: FindOptions) =>
  refs.filter(
    (ref) =>
      (options.type === "*" || ref.type === options.type) &&
      (options.names.length === 0 || options.names.includes(ref.name)) &&
      (Option.isNone(options.owner) || ref.owner === options.owner.value),
  );

/** Failed reads can retry; successful values live only for this locator plan. */
export const makeLocatorSourceView = (
  sources: SourceHostProvidersService,
  candidateCount: number,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const checkouts = yield* ScopedCache.makeWith({
      lookup: (key: GitCheckoutKey) =>
        Effect.gen(function* () {
          const directory = yield* Effect.acquireRelease(
            fs.makeTempDirectory({ prefix: "axm-source-discovery-" }).pipe(
              Effect.mapError(
                (cause) =>
                  new SourceNetworkFailure({
                    detail: "Temporary source directory could not be created",
                    cause,
                  }),
              ),
            ),
            (created) => fs.remove(created, { recursive: true }).pipe(Effect.ignore),
          );
          yield* shallowClone(key.url, directory, key.ref);
          return directory;
        }),
      capacity: candidateCount,
      timeToLive: (exit) => (Exit.isSuccess(exit) ? Duration.infinity : Duration.zero),
    });
    const cache = yield* Cache.makeWith(
      (key: GitDiscoveryKey) =>
        ScopedCache.get(checkouts, key.checkout).pipe(
          Effect.flatMap((directory) =>
            discoverConventionRefs(
              {
                type: "git",
                url: new URL(key.checkout.url),
                ref: Option.fromUndefinedOr(key.checkout.ref),
                subPath: Option.fromUndefinedOr(key.subPath),
              } satisfies GitSource,
              directory,
              { type: "*", names: [], owner: Option.none(), versionRange: Option.none() },
            ),
          ),
        ),
      {
        capacity: candidateCount,
        timeToLive: (exit) => (Exit.isSuccess(exit) ? Duration.infinity : Duration.zero),
      },
    );
    return {
      ...sources,
      find: (source, options) =>
        source.type === "git"
          ? Cache.get(cache, gitDiscoveryKey(source)).pipe(
              Effect.map((refs) => matchingGitRefs(refs, options)),
            )
          : sources.find(source, options),
    } satisfies SourceHostProvidersService;
  });
