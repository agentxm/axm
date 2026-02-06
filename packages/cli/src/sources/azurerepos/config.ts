import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ParseError } from "../errors.js";
import type { AzureReposSource, SourceConfig } from "../types.js";
import { AZUREREPOS_HTTPS_PATTERN, AZUREREPOS_SSH_PATTERN } from "./patterns.js";

export const config: SourceConfig<"azurerepos", AzureReposSource> = {
  id: "azurerepos",
  make: (args: {
    organization: string;
    project: string;
    repo: string;
    ref?: string | undefined;
    subPath?: string | undefined;
  }): AzureReposSource => ({
    source: "azurerepos",
    organization: args.organization,
    project: args.project,
    repo: args.repo,
    ref: Option.fromNullable(args.ref),
    subPath: Option.fromNullable(args.subPath),
  }),
  print: (source) => `azurerepos:${source.organization}/${source.project}/${source.repo}`,
  shorthand: Option.none(),
  parseFromUrl: Option.some({
    hostname: "dev.azure.com",
    parseUrl: (url) => {
      const match = url.href.match(AZUREREPOS_HTTPS_PATTERN);
      if (!match || !match[1] || !match[2] || !match[3]) {
        return Effect.fail(
          new ParseError({ message: "Invalid Azure Repos URL format", input: url.href }),
        );
      }
      return Effect.succeed(
        config.make({ organization: match[1], project: match[2], repo: match[3] }),
      );
    },
    parseScp: (input) => {
      const match = input.match(AZUREREPOS_SSH_PATTERN);
      if (!match || !match[1] || !match[2] || !match[3]) {
        return Effect.fail(
          new ParseError({ message: "Invalid Azure Repos SSH URL format", input }),
        );
      }
      return Effect.succeed(
        config.make({ organization: match[1], project: match[2], repo: match[3] }),
      );
    },
  }),
};
