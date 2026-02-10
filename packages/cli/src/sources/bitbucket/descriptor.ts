import * as Option from "effect/Option";

import type { BitbucketSourceInput, SourceDescriptor } from "../types.js";
import { print } from "./print.js";
import { parseScp } from "./scp.js";
import { parseShorthand, shorthandPrefix } from "./shorthand.js";
import { parseUrl } from "./url.js";

export const descriptor: SourceDescriptor<"bitbucket", BitbucketSourceInput> = {
  id: "bitbucket",
  print,
  shorthand: Option.some({
    prefix: shorthandPrefix,
    parse: parseShorthand,
  }),
  parseFromUrl: Option.some({
    hostname: "bitbucket.org",
    parseUrl: parseUrl,
    parseScp: parseScp,
  }),
};
