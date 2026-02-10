import * as Option from "effect/Option";

import type { GitHubSource, SourceDescriptor } from "../types.js";
import { print } from "./print.js";
import { parseShorthand, shorthandPrefix } from "./shorthand.js";
import { parseScp } from "./scp.js";
import { parseUrl } from "./url.js";

export const descriptor: SourceDescriptor<"github", GitHubSource> = {
  id: "github",
  print,
  shorthand: Option.some({
    prefix: shorthandPrefix,
    parse: parseShorthand,
  }),
  parseFromUrl: Option.some({
    hostname: "github.com",
    parseUrl: parseUrl,
    parseScp: parseScp,
  }),
};
