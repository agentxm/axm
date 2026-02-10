import * as Option from "effect/Option";

import type { AzureReposSourceInput, SourceDescriptor } from "../types.js";
import { print } from "./print.js";
import { parseScp } from "./scp.js";
import { parseUrl } from "./url.js";

export const descriptor: SourceDescriptor<"azurerepos", AzureReposSourceInput> = {
  id: "azurerepos",
  print,
  shorthand: Option.none(),
  parseFromUrl: Option.some({
    hostname: "dev.azure.com",
    parseUrl: parseUrl,
    parseScp: parseScp,
  }),
};
