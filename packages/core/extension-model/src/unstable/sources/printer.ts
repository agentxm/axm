/**
 * Source printer for canonical shorthand strings.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";
import { formatFqn } from "../extensions/fqn.js";
import {
  forgeCoordinateFromGitUrl,
  printForgeCoordinate,
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
    case "local":
      return printLocalSource(source);
    case "git": {
      return Option.match(forgeCoordinateFromGitUrl(source.url, source.ref, source.subPath), {
        onSome: printForgeCoordinate,
        onNone: () => {
          const url = new URL(source.url.href);
          url.hash = Option.getOrElse(source.ref, () => "");
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
