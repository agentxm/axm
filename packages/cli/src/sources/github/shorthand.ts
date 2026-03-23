import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { parseProviderShorthand } from "../parse-provider-shorthand.js";
import type { GitHubSourceParams } from "../types.js";

export const parseShorthand = (input: string) =>
  Effect.gen(function* () {
    const body = input.slice("github:".length);
    const parts = yield* parseProviderShorthand(body, input);
    return {
      type: "github",
      owner: parts.owner,
      repo: parts.repo,
      ref: Option.fromUndefinedOr(parts.ref),
      subPath: Option.fromUndefinedOr(parts.subPath),
    } satisfies GitHubSourceParams;
  });
