import * as Option from "effect/Option";

import type { LocalSource, SourceDescriptor } from "../types.js";
import { print } from "./print.js";

export const descriptor: SourceDescriptor<"local", LocalSource> = {
  id: "local",
  print,
  shorthand: Option.none(),
  parseFromUrl: Option.none(),
};
