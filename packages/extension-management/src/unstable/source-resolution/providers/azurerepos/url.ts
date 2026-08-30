import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { makeAppError } from "../../../app-error/index.js";
import {
  AzureReposSourceParamsSchema,
  type AzureReposSourceParams,
} from "../../../sources/types.js";
import { refFromUrlHash } from "../../url-fragment.js";

export const CANONICAL_HOSTNAME = "dev.azure.com";

/** Matches: /{org}/{project}/_git/{repo} */
const AZUREREPOS_PATH_PATTERN = /^\/([^/]+)\/([^/]+)\/_git\/([^/]+?)(?:\.git)?$/;
const decodeAzureReposSourceParams = Schema.decodeUnknownResult(AzureReposSourceParamsSchema);

export const parseUrl = (url: URL, hostname: string = CANONICAL_HOSTNAME) => {
  if (url.hostname !== hostname) {
    return Effect.fail(
      makeAppError({
        code: "validation",
        detail: "Invalid Azure Repos URL format",
      }),
    );
  }
  const match = url.pathname.match(AZUREREPOS_PATH_PATTERN);
  if (!match || !match[1] || !match[2] || !match[3]) {
    return Effect.fail(
      makeAppError({
        code: "validation",
        detail: "Invalid Azure Repos URL format",
      }),
    );
  }
  const fragmentRef = Option.getOrUndefined(refFromUrlHash(url));
  const decoded = decodeAzureReposSourceParams({
    type: "azurerepos",
    organization: match[1],
    project: match[2],
    repo: match[3],
    ...(fragmentRef === undefined ? {} : { ref: fragmentRef }),
  });
  return Result.isSuccess(decoded)
    ? Effect.succeed(decoded.success satisfies AzureReposSourceParams)
    : Effect.fail(
        makeAppError({
          code: "validation",
          detail: "Invalid Azure Repos URL format",
        }),
      );
};
