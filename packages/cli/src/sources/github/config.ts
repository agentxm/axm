import * as Option from "effect/Option";

import type { GitHubSource, SourceConfig } from "../types.js";
import { make } from "./make.js";
import { parseScp } from "./scp.js";
import { parseShorthand, printShorthand, shorthandPrefix } from "./shorthand.js";
import { parseUrl } from "./url.js";

export const config: SourceConfig<"github", GitHubSource> = {
  id: "github",
  make: make,
  print: printShorthand,
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
