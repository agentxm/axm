import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { parseProviderShorthand } from "../parse-provider-shorthand.js";
import type { BitbucketSourceParams } from "../types.js";

export const parseShorthand = (input: string) =>
  Effect.gen(function* () {
    const body = input.slice("bitbucket:".length);
    const parts = yield* parseProviderShorthand(body, input);
    return {
      type: "bitbucket",
      owner: parts.owner,
      repo: parts.repo,
      ref: Option.fromNullable(parts.ref),
      subPath: Option.fromNullable(parts.subPath),
    } satisfies BitbucketSourceParams;
  });
