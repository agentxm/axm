import * as Option from "effect/Option";

import type { BitbucketSource } from "../types.js";

export const print = (source: BitbucketSource) => {
  let s = `bitbucket:${source.owner}/${source.repo}`;
  if (Option.isSome(source.subPath)) s += `/${source.subPath.value}`;
  if (Option.isSome(source.ref)) s += `@${source.ref.value}`;
  return s;
};
