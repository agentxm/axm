import * as Option from "effect/Option";

import type { AzureReposSourceParams } from "../types.js";

export const print = (source: AzureReposSourceParams) => {
  let s = `azurerepos:${source.organization}/${source.project}/${source.repo}`;
  if (Option.isSome(source.subPath)) s += `/${source.subPath.value}`;
  if (Option.isSome(source.ref)) s += `@${source.ref.value}`;
  return s;
};
