import * as Option from "effect/Option";

import type { BitbucketSourceParams } from "../types.js";

export const print = (source: BitbucketSourceParams) => {
  let s = `bitbucket:${source.owner}/${source.repo}`;
  if (Option.isSome(source.subPath)) s += `/${source.subPath.value}`;
  if (Option.isSome(source.ref)) s += `@${source.ref.value}`;
  return s;
};
