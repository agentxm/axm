import * as Option from "effect/Option";

import type { GitHubSource } from "../types.js";

export const make = (args: {
  owner: string;
  repo: string;
  ref?: string | undefined;
  subPath?: string | undefined;
}): GitHubSource => ({
  source: "github",
  owner: args.owner,
  repo: args.repo,
  ref: Option.fromNullable(args.ref),
  subPath: Option.fromNullable(args.subPath),
});
