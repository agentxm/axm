import * as Option from "effect/Option";

import type { LocalSource, SourceConfig } from "../types.js";
import { print } from "./print.js";

export const config: SourceConfig<"local", LocalSource> = {
  id: "local",
  print,
  shorthand: Option.none(),
  parseFromUrl: Option.none(),
};
