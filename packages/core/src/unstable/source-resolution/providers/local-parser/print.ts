import type { LocalSourceParams } from "../../../sources/types.js";

export const print = (source: LocalSourceParams) =>
  source.path.startsWith("/") || source.path.startsWith(".") ? source.path : `./${source.path}`;
