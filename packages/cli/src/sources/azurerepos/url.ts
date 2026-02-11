import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ParseError } from "../errors.js";
import type { AzureReposSourceInput } from "../types.js";

export const CANONICAL_HOSTNAME = "dev.azure.com";

/** Matches: https://dev.azure.com/{org}/{project}/_git/{repo} */
const AZUREREPOS_HTTPS_PATTERN =
  /^https?:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+?)(?:\.git)?$/;

export const parseUrl = (url: URL) => {
  const match = url.href.match(AZUREREPOS_HTTPS_PATTERN);
  if (!match || !match[1] || !match[2] || !match[3]) {
    return Effect.fail(
      new ParseError({ message: "Invalid Azure Repos URL format", input: url.href }),
    );
  }
  return Effect.succeed({
    source: "azurerepos",
    organization: match[1],
    project: match[2],
    repo: match[3],
    ref: Option.none(),
    subPath: Option.none(),
  } satisfies AzureReposSourceInput);
};
