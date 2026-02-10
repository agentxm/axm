import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ParseError } from "../errors.js";
import type { AzureReposSourceInput } from "../types.js";

/** Matches: git@ssh.dev.azure.com:v3/{org}/{project}/{repo} */
const AZUREREPOS_SSH_PATTERN =
  /^git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?$/;

export const parseScp = (input: string) => {
  const match = input.match(AZUREREPOS_SSH_PATTERN);
  if (!match || !match[1] || !match[2] || !match[3]) {
    return Effect.fail(new ParseError({ message: "Invalid Azure Repos SSH URL format", input }));
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
