import * as Option from "effect/Option";

import type { LocalSource, SourceConfig } from "../types.js";
import { parseLocalPath } from "./parser.js";

export const config: SourceConfig<"local", LocalSource> = {
  id: "local",
  shorthandPrefix: Option.some("local"),
  parseShorthand: Option.some((input: string) => parseLocalPath(input.slice("local:".length))),
};
