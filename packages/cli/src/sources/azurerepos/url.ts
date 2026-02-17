import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { makeCliError } from "../../cli-error/index.js";
import type { AzureReposSourceInputLegacy } from "../types.js";

export const CANONICAL_HOSTNAME = "dev.azure.com";

/** Matches: /{org}/{project}/_git/{repo} */
const AZUREREPOS_PATH_PATTERN = /^\/([^/]+)\/([^/]+)\/_git\/([^/]+?)(?:\.git)?$/;

export const parseUrl = (url: URL, hostname: string = CANONICAL_HOSTNAME) => {
  if (url.hostname !== hostname) {
    return Effect.fail(
      makeCliError({
        code: "SOURCE_PARSE_FAILED",
        what: "Invalid Azure Repos URL format",
        details: [url.href],
      }),
    );
  }
  const match = url.pathname.match(AZUREREPOS_PATH_PATTERN);
  if (!match || !match[1] || !match[2] || !match[3]) {
    return Effect.fail(
      makeCliError({
        code: "SOURCE_PARSE_FAILED",
        what: "Invalid Azure Repos URL format",
        details: [url.href],
      }),
    );
  }
  return Effect.succeed({
    type: "azurerepos",
    organization: match[1],
    project: match[2],
    repo: match[3],
    ref: Option.none(),
    subPath: Option.none(),
  } satisfies AzureReposSourceInputLegacy);
};
