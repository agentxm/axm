import * as Option from "effect/Option";

import type { LocalSource, SourceConfig } from "../types.js";

export const config: SourceConfig<"local", LocalSource> = {
  id: "local",
  print: (source) => `local:${source.path}`,
  shorthand: Option.none(),
  parseFromUrl: Option.none(),
};
