import * as Option from "effect/Option";

import type { AzureReposSourceParams } from "../../../sources/types.js";

export const print = (
  source: AzureReposSourceParams,
  sourceName = source.sourceName ?? "azurerepos",
) => {
  let s = `${sourceName}:${source.organization}/${source.project}/${source.repo}`;
  if (Option.isSome(source.subPath)) s += `//${source.subPath.value}`;
  if (Option.isSome(source.ref)) s += `@${source.ref.value}`;
  return s;
};
