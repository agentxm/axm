import * as Option from "effect/Option";

import type { GitLabSource, SourceConfig } from "../types.js";
import { print } from "./print.js";
import { parseScp } from "./scp.js";
import { parseShorthand, shorthandPrefix } from "./shorthand.js";
import { parseUrl } from "./url.js";

export const config: SourceConfig<"gitlab", GitLabSource> = {
  id: "gitlab",
  print,
  shorthand: Option.some({
    prefix: shorthandPrefix,
    parse: parseShorthand,
  }),
  parseFromUrl: Option.some({
    hostname: "gitlab.com",
    parseUrl: parseUrl,
    parseScp: parseScp,
  }),
};
