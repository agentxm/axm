/**
 * Source printer for canonical shorthand strings.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";
import { formatFqn } from "../extensions/fqn.js";
import {
  printAzureReposSource,
  printBitbucketSource,
  printGitHubSource,
  printGitLabSource,
  printLocalSource,
} from "./forge-grammar.js";
import type { SourceParams } from "./types.js";

/**
 * Print source params as their canonical shorthand string.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const printSourceParams = (source: SourceParams): string => {
  switch (source.type) {
    case "github":
      return printGitHubSource(
        source,
        source.sourceName ?? ("name" in source ? String(source.name) : "github"),
      );
    case "gitlab":
      return printGitLabSource(
        source,
        source.sourceName ?? ("name" in source ? String(source.name) : "gitlab"),
      );
    case "bitbucket":
      return printBitbucketSource(
        source,
        source.sourceName ?? ("name" in source ? String(source.name) : "bitbucket"),
      );
    case "azurerepos":
      return printAzureReposSource(
        source,
        source.sourceName ?? ("name" in source ? String(source.name) : "azurerepos"),
      );
    case "local":
      return printLocalSource(source);
    case "git": {
      const url = new URL(source.url.href);
      url.hash = Option.getOrElse(source.ref, () => "");
      return url.href;
    }
    case "registry": {
      return source.sourceName ?? ("name" in source ? String(source.name) : "agentxm");
    }
    case "inline":
      return "inline";
    case "workspace":
      return `workspace:${formatFqn({
        owner: source.owner,
        type: source.extensionType,
        name: source.name,
      })}`;
  }
};
