import * as Option from "effect/Option";

import type { GitHubSourceInput, SourceDescriptor } from "../types.js";
import { print } from "./print.js";
import { parseShorthand, shorthandPrefix } from "./shorthand.js";
import { parseScp } from "./scp.js";
import { parseUrl } from "./url.js";

export const descriptor: SourceDescriptor<"github", GitHubSourceInput> = {
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
