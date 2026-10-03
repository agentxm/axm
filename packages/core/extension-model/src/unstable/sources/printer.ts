/**
 * Source printer for canonical shorthand strings.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";
import { formatFqn } from "../extensions/fqn.js";
import { forgeCoordinateFromGitUrl, printForgeCoordinate } from "./forge-grammar.js";
import type { LocalSourceParams, SourceParams } from "./types.js";

const printLocalSource = (source: LocalSourceParams): string => {
  if (source.path === "." || source.path === "..") return `${source.path}/`;
  return /^(?:\.\.?\/|\/|~[\\/]|[A-Za-z]:[\\/])/.test(source.path)
    ? source.path
    : `./${source.path}`;
};

/**
 * Print source params as their canonical shorthand string.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const printSourceParams = (source: SourceParams): string => {
  switch (source.type) {
    case "http": {
      const url = new URL(source.url.href);
      if (source.entry !== undefined) url.hash = `skill=${encodeURIComponent(source.entry)}`;
      return url.href;
    }
    case "local":
      return printLocalSource(source);
    case "git": {
      return Option.match(forgeCoordinateFromGitUrl(source.url, source.ref, source.subPath), {
        onSome: printForgeCoordinate,
        onNone: () => {
          const url = new URL(source.url.href);
          if (Option.isSome(source.subPath)) {
            const selector = new URLSearchParams({ path: source.subPath.value });
            if (Option.isSome(source.ref)) selector.set("ref", source.ref.value);
            url.hash = `axm:${selector.toString()}`;
          } else url.hash = Option.getOrElse(source.ref, () => "");
          return url.href;
        },
      });
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
