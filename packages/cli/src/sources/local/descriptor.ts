import * as Option from "effect/Option";

import type { LocalSourceInput, SourceDescriptor } from "../types.js";
import { print } from "./print.js";

export const descriptor: SourceDescriptor<"local", LocalSourceInput> = {
  id: "local",
  print,
  shorthand: Option.none(),
  parseFromUrl: Option.none(),
};
