import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { ParseError } from "../errors.js";
import { parseProviderShorthand } from "../parse-provider-shorthand.js";
import {
  type GitLabSource,
  type ParsedSource,
  ParsedSource as PS,
  type SourceConfig,
} from "../types.js";

export const config: SourceConfig<"gitlab", GitLabSource> = {
  id: "gitlab",
  shorthandPrefix: Option.some("gitlab"),
  parseShorthand: Option.some(
    (input: string): Effect.Effect<ParsedSource<GitLabSource>, ParseError> =>
      Effect.gen(function* () {
        const body = input.slice("gitlab:".length);
        const parts = yield* parseProviderShorthand(body, input);
        return PS.GitLab({ original: input, ...parts });
      }),
  ),
};
