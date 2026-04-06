import * as Effect from "effect/Effect";

import { parseProviderShorthand } from "../parse-provider-shorthand.js";
import type { GitLabSourceParams } from "../../../sources/types.js";

export const parseShorthand = (input: string) =>
  Effect.gen(function* () {
    const body = input.slice("gitlab:".length);
    const parts = yield* parseProviderShorthand(body, input);
    return {
      type: "gitlab",
      ...parts,
    } satisfies GitLabSourceParams;
  });
