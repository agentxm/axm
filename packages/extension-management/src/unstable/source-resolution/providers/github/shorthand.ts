import * as Effect from "effect/Effect";

import { parseProviderShorthand } from "../parse-provider-shorthand.js";
import type { GitHubSourceParams } from "../../../sources/types.js";

export const parseShorthand = (input: string) =>
  Effect.gen(function* () {
    const body = input.slice("github:".length);
    const parts = yield* parseProviderShorthand(body, input);
    return {
      type: "github",
      ...parts,
    } satisfies GitHubSourceParams;
  });
