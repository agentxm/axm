import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { makeAppError } from "../../../app-error/index.js";
import type { AzureReposSourceParams } from "../../../sources/types.js";

const CANONICAL_SSH_HOSTNAME = "ssh.dev.azure.com";

/** Matches: git@{hostname}:v3/{org}/{project}/{repo} */
const SCP_PATTERN = /^git@([^:]+):v3\/([^/]+)\/([^/]+)\/([^/]+?)(?:\.git)?$/;

export const parseScp = (input: string, hostname: string = CANONICAL_SSH_HOSTNAME) => {
  const match = input.match(SCP_PATTERN);
  if (!match || !match[1] || !match[2] || !match[3] || !match[4] || match[1] !== hostname) {
    return Effect.fail(
      makeAppError({
        code: "SOURCE_PARSE_FAILED",
        what: "Invalid Azure Repos SSH URL format",
        details: [input],
      }),
    );
  }
  return Effect.succeed({
    type: "azurerepos",
    organization: match[2],
    project: match[3],
    repo: match[4],
    ref: Option.none(),
    subPath: Option.none(),
  } satisfies AzureReposSourceParams);
};
