import * as Option from "effect/Option";

import type { GitHubSource, SourceConfig } from "../types.js";
import { print } from "./print.js";
import { parseShorthand, shorthandPrefix } from "./shorthand.js";
import { parseScp } from "./scp.js";
import { parseUrl } from "./url.js";

export const config: SourceConfig<"github", GitHubSource> = {
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
