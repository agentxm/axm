/** Share one captured Git source view across the type probes of a locator install. */

import * as Cache from "effect/Cache";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";

import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { FindOptions } from "@agentxm/extension-model/unstable/sources/source-host-provider";
import type { GitSource } from "@agentxm/extension-model/unstable/sources/types";
import { gitTransportContextFingerprint } from "../../resolution/sources/git/operations.js";
import type { SourceHostProvidersService } from "../../resolution/sources/service.js";

class GitDiscoveryKey extends Data.Class<{
  readonly url: string;
  readonly ref: string | undefined;
  readonly subPath: string | undefined;
  readonly transportContext: string;
}> {}

const gitDiscoveryKey = (source: GitSource): GitDiscoveryKey =>
  new GitDiscoveryKey({
    url: source.url.href,
    ref: Option.getOrUndefined(source.ref),
    subPath: Option.getOrUndefined(source.subPath),
    transportContext: gitTransportContextFingerprint(),
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
    const cache = yield* Cache.makeWith(
      (key: GitDiscoveryKey) =>
        sources.find(
          {
            type: "git",
            url: new URL(key.url),
            ref: Option.fromUndefinedOr(key.ref),
            subPath: Option.fromUndefinedOr(key.subPath),
          } satisfies GitSource,
          { type: "*", names: [], owner: Option.none(), versionRange: Option.none() },
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
