/**
 * Source printer for canonical shorthand strings.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";
import { formatFqn } from "../extensions/fqn.js";
import { printLocalSource } from "./forge-grammar.js";
import type { SourceParams } from "./types.js";

/**
 * Print source params as their canonical shorthand string.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const printSourceParams = (source: SourceParams): string => {
  switch (source.type) {
    case "local":
      return printLocalSource(source);
    case "git": {
      const repositorySegments = source.url.pathname
        .split("/")
        .filter((segment) => segment.length > 0);
      if (
        source.url.hostname === "dev.azure.com" &&
        repositorySegments.length === 4 &&
        repositorySegments[2] === "_git"
      ) {
        let shorthand = `azurerepos:${repositorySegments[0]}/${repositorySegments[1]}/${repositorySegments[3]}`;
        if (Option.isSome(source.subPath)) shorthand += `//${source.subPath.value}`;
        if (Option.isSome(source.ref)) shorthand += `@${source.ref.value}`;
        return shorthand;
      }
      const lastSegment = repositorySegments.at(-1);
      const repo = lastSegment?.endsWith(".git") ? lastSegment.slice(0, -4) : lastSegment;
      const sourcePrefix =
        source.url.hostname === "github.com"
          ? "github"
          : source.url.hostname === "gitlab.com"
            ? "gitlab"
            : source.url.hostname === "bitbucket.org"
              ? "bitbucket"
              : undefined;
      if (sourcePrefix !== undefined && repo !== undefined && repositorySegments.length >= 2) {
        const owner = repositorySegments.slice(0, -1).join("/");
        let shorthand = `${sourcePrefix}:${owner}/${repo}`;
        if (Option.isSome(source.subPath)) shorthand += `//${source.subPath.value}`;
        if (Option.isSome(source.ref)) shorthand += `@${source.ref.value}`;
        return shorthand;
      }
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
