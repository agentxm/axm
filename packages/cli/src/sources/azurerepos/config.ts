import * as Option from "effect/Option";

import type { AzureReposSource, SourceConfig } from "../types.js";
import { print } from "./print.js";
import { parseScp } from "./scp.js";
import { parseUrl } from "./url.js";

export const config: SourceConfig<"azurerepos", AzureReposSource> = {
  id: "azurerepos",
  print,
  shorthand: Option.none(),
  parseFromUrl: Option.some({
    hostname: "dev.azure.com",
    parseUrl: parseUrl,
    parseScp: parseScp,
  }),
};
