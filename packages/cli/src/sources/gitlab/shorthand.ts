import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { parseProviderShorthand } from "../parse-provider-shorthand.js";
import type { GitLabSourceInput } from "../types.js";

export const shorthandPrefix = "gitlab" as const;

export const parseShorthand = (input: string) =>
  Effect.gen(function* () {
    const body = input.slice("gitlab:".length);
    const parts = yield* parseProviderShorthand(body, input);
    return {
      source: "gitlab",
      owner: parts.owner,
      repo: parts.repo,
      ref: Option.fromNullable(parts.ref),
      subPath: Option.fromNullable(parts.subPath),
    } satisfies GitLabSourceInput;
  });
