import * as Option from "effect/Option";

import type { GitHubSourceInput } from "../types.js";

export const print = (source: GitHubSourceInput) => {
  let s = `github:${source.owner}/${source.repo}`;
  if (Option.isSome(source.subPath)) s += `/${source.subPath.value}`;
  if (Option.isSome(source.ref)) s += `@${source.ref.value}`;
  return s;
};
