import * as Option from "effect/Option";

import type { LocalSource, SourceConfig } from "../types.js";
import { parseLocalPath } from "./parser.js";

export const config: SourceConfig<"local", LocalSource> = {
  id: "local",
  make: (args: { path: string }): LocalSource => ({
    source: "local",
    path: args.path,
  }),
  print: (source) => `local:${source.path}`,
  shorthand: Option.some({
    prefix: "local",
    parse: (input: string) => parseLocalPath(input.slice("local:".length)),
  }),
  parseFromUrl: Option.none(),
};
