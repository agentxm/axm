import * as Effect from "effect/Effect";

import { parseProviderShorthand } from "../parse-provider-shorthand.js";
import type { BitbucketSourceParams } from "@agentxm/extension-model/unstable/sources/types";

export const parseShorthand = (input: string) =>
  Effect.gen(function* () {
    const body = input.slice("bitbucket:".length);
    const parts = yield* parseProviderShorthand(body, input);
    return {
      type: "bitbucket",
      ...parts,
    } satisfies BitbucketSourceParams;
  });
