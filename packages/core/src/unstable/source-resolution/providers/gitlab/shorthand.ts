import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { parseProviderShorthand } from "../parse-provider-shorthand.js";
import type { GitLabSourceParams } from "../../../sources/types.js";

export const parseShorthand = (input: string) =>
  Effect.gen(function* () {
    const body = input.slice("gitlab:".length);
    const parts = yield* parseProviderShorthand(body, input);
    return {
      type: "gitlab",
      owner: parts.owner,
      repo: parts.repo,
      ref: Option.fromUndefinedOr(parts.ref),
      subPath: Option.fromUndefinedOr(parts.subPath),
    } satisfies GitLabSourceParams;
  });
